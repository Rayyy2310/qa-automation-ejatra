const axios = require('axios');

/**
 * AI-Powered Runtime Self-Healing Engine for Playwright
 * When an element is not found, this module analyzes the live DOM snapshot
 * and asks the AI to find the replacement element on the fly.
 */

async function extractCompactInteractiveDOM(page) {
  try {
    return await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, input, select, textarea, label, [role="button"], [role="tab"], [role="menuitem"], .btn, table, tr, th, td, h1, h2, h3, h4, h5, h6, .card, form'));
      const visible = elements.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
      });

      return visible.slice(0, 100).map(el => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? ` id="${el.id}"` : '';
        const name = el.getAttribute('name') ? ` name="${el.getAttribute('name')}"` : '';
        const type = el.getAttribute('type') ? ` type="${el.getAttribute('type')}"` : '';
        const placeholder = el.getAttribute('placeholder') ? ` placeholder="${el.getAttribute('placeholder')}"` : '';
        const role = el.getAttribute('role') ? ` role="${el.getAttribute('role')}"` : '';
        const cls = el.className && typeof el.className === 'string' ? ` class="${el.className.split(' ').slice(0, 3).join(' ')}"` : '';
        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 50);

        if (['input', 'select', 'textarea'].includes(tag)) {
          return `<${tag}${id}${name}${type}${placeholder}${cls} /> (Near: ${text || 'input'})`;
        }
        return `<${tag}${id}${cls}${role}>${text}</${tag}>`;
      }).join('\n');
    });
  } catch (e) {
    return '';
  }
}

/**
 * Ask AI to heal the selector by analyzing live DOM
 * @param {Object} page - Playwright page object
 * @param {string} action - Action being performed (click, fill, select, etc.)
 * @param {string|Object} target - Target that failed
 * @param {string} expectedResult - Step expected result
 * @returns {Promise<Object|null>} - Replacement locator or null
 */
async function attemptSelfHealing(page, action, target, expectedResult = '') {
  const targetStr = typeof target === 'object' ? JSON.stringify(target) : String(target || '');
  const compactDOM = await extractCompactInteractiveDOM(page);
  if (!compactDOM) return null;

  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) return null;

  const prompt = `You are a Playwright Self-Healing Agent.
The test step failed to find an element for:
Action: ${action}
Target: ${targetStr}
Expected: ${expectedResult}

Here is the list of visible interactive elements currently on the webpage:
\`\`\`html
${compactDOM}
\`\`\`

Identify which element in the list matches what the user wanted to interact with.
Respond ONLY with a valid JSON object:
{
  "found": true,
  "strategy": "css | text | role",
  "value": "exact selector or text to target this element"
}
If no matching element exists, return {"found": false}.`;

  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'groq/compound-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 256
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 4000
    });

    const content = res.data?.choices?.[0]?.message?.content || '';
    const clean = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed && parsed.found && parsed.value) {
      if (parsed.strategy === 'css') {
        const loc = page.locator(parsed.value);
        if (await loc.count() > 0) return { locator: loc.first(), healedSelector: parsed.value };
      } else if (parsed.strategy === 'text') {
        const loc = page.getByText(new RegExp(parsed.value, 'i'));
        if (await loc.count() > 0) return { locator: loc.first(), healedSelector: parsed.value };
      } else if (parsed.strategy === 'role') {
        const loc = page.getByRole('button', { name: new RegExp(parsed.value, 'i') })
          .or(page.getByRole('link', { name: new RegExp(parsed.value, 'i') }));
        if (await loc.count() > 0) return { locator: loc.first(), healedSelector: parsed.value };
      }
    }
  } catch (err) {
    // Silent fail if self-healing API is unavailable
  }

  return null;
}

module.exports = {
  extractCompactInteractiveDOM,
  attemptSelfHealing
};
