const TIMEOUTS = {
  TINY: 100,
  DROPDOWN_SETTLE: 150,
  FAST: 200,
  READY_SETTLE: 250,
  SHORT: 300,
  MODAL_SETTLE: 350,
  SETTLE: 400,
  SEARCH_SETTLE: 600,
  MEDIUM: 1000,
  GENERATE_SETTLE: 1500,
  CLICK_FAST: 2000,
  NETWORK_IDLE_SHORT: 2500,
  LONG: 3000,
  DOM_CONTENT_WAIT: 4000,
  EXTRA_LONG: 5000,
  WAIT_READY_DEFAULT: 7000,
  NAVIGATION: 8000,
  MAX: 30000,
};

const ROW_ACTION_KEYWORDS = [
  'view data', 'view', 'lihat data', 'lihat', 'detail',
  'ubah harga', 'edit harga', 'ganti harga',
  'edit', 'ubah',
  'cetak', 'print', 'pdf',
  'aktifkan kembali', 'aktifkan', 'aktif', 'activate',
  'batalkan', 'batal', 'nonaktifkan', 'deactivate',
  'hapus', 'delete',
  'close', 'tutup', 'selesai',
  'hamburger', 'tombol hamburger', 'menu hamburger', 'tombol aksi'
];

const SUBMIT_LOGIN_KEYWORDS = [
  'masuk', 'login', 'submit', 'simpan'
];

const SWAL_SELECTORS = {
  LOADING: '.swal2-loading',
  POPUP_VISIBLE: '.swal2-popup:visible',
  CONFIRM: '.swal2-confirm',
  CANCEL: '.swal2-cancel',
  CLOSE: '.swal2-close',
  POPUP_OR_MODAL_VISIBLE: '.swal2-popup:visible, .modal.show:visible',
  MODAL_OR_SWAL_SHOWN: '.modal.show, .swal2-container.swal2-shown, [role="dialog"]:not([style*="display: none"])',
  CLOSEST_MODAL: '.modal.show, .modal.in, .modal:not([style*="display: none"]), [role="dialog"], .modal-dialog, div[id*="modal" i], .swal2-container, .swal2-popup, .bootbox',
};

const CLICK_TEXT_SELECTORS = {
  SAVE_BUTTONS: [
    'button:has-text("Simpan")',
    'a.btn:has-text("Simpan")',
    'button:has-text("Save")',
    'a.btn:has-text("Save")',
    'form:visible button:has-text("Simpan")',
    'form:visible button[type="submit"]:not([id*="task"]):not([id*="add"])',
  ],
  LOGIN_BUTTONS: [
    'button:has-text("Masuk")',
    'button:has-text("Login")',
    'form:visible button[type="submit"]',
  ],
  GENERIC_SUBMIT_BUTTONS: [
    'form:visible button[type="submit"]:not([id*="task"]):not([id*="add"])',
    'button[type="submit"]:not([id*="task"]):not([id*="add"])',
    'input[type="submit"]',
  ],
  SWAL_ADD_BUTTON: '.swal2-popup button:has-text("Tambah")',
  FORM_ADD_FALLBACK_BUTTONS: [
    '.tab-pane.active button:has-text("Tambah")',
    'button[id*="tambah" i]',
    'button:has-text("Tambah")',
  ],
  MODAL_PICK_TABLE_BUTTONS: [
    'table tbody tr button:has-text("Pilih")',
    'table tbody tr .btn:has-text("Pilih")',
    'button:has-text("Pilih")',
    'a.btn:has-text("Pilih")',
    'a:has-text("Pilih")',
    'table tbody tr button',
    'table tbody tr .btn',
  ],
  MODAL_PICK_ROW_BUTTONS: [
    'button:has-text("Pilih")',
    'a.btn:has-text("Pilih")',
    'a:has-text("Pilih")',
    'button',
    '.btn',
  ],
  MODAL_PICK_SIMPLE_BUTTON: 'button:has-text("Pilih")',
  MODAL_CONFIRM_BUTTONS: [
    'button:has-text("Verifikasi")',
    'button:has-text("Approve")',
    'button:has-text("Konfirmasi")',
    'button:has-text("Tambah")',
    'button:has-text("Simpan")',
    'button:has-text("Ya")',
    'button.btn-primary',
    'button[type="submit"]',
  ],
  MODAL_FOOTER_CLOSE_BUTTONS: [
    'button:has-text("Tutup")',
    'a:has-text("Tutup")',
    'button:has-text("Close")',
    'a:has-text("Close")',
    'button:has-text("Batal")',
    'a:has-text("Batal")',
  ],
};

const RUN_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ERROR: 'ERROR'
};

module.exports = {
  TIMEOUTS,
  ROW_ACTION_KEYWORDS,
  SUBMIT_LOGIN_KEYWORDS,
  SWAL_SELECTORS,
  CLICK_TEXT_SELECTORS,
  RUN_STATUS
};
