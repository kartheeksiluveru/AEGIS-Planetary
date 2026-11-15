import { nodes, sectors } from './data.js';

const form = document.querySelector('#registration-form');
const registrationLayout = document.querySelector('#registration-layout');
const successPanel = document.querySelector('#registration-success');
const submitButton = document.querySelector('#submit-registration');
const sectorSelect = document.querySelector('#sector');
const proposedSectorField = document.querySelector('#proposed-sector-field');
const proposedSectorInput = document.querySelector('#proposed-sector');
const townInput = document.querySelector('#town');
const fileInput = document.querySelector('#sample-frames');
const fileDropzone = document.querySelector('#sample-dropzone');
const fileList = document.querySelector('#sample-file-list');
const uploadCount = document.querySelector('#upload-count');
const sampleError = document.querySelector('#sample-error');
const locationMessage = document.querySelector('#location-message');
const files = [];
const touched = new Set();
const locations = { latitude:null, longitude:null };
const fileExtensions = new Set(['jpg', 'jpeg', 'png', 'fit', 'fits', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f']);
const imageExtensions = new Set(['jpg', 'jpeg', 'png']);
const sectorCodes = new Map([
  ['South India', 'IND'], ['Atacama', 'ATC'], ['Central Alps', 'ALP'],
  ['Canary Islands', 'CAN'], ['Namibia', 'NAM'], ['Australian Outback', 'AUS'], ['Hawaii', 'HAW']
]);
const fieldOrder = ['callsign', 'email', 'sector', 'proposed-sector', 'town', 'bortle', 'camera', 'telescope', 'mount', 'exposure', 'consent'];
const formSteps = {
  identity:['callsign', 'email'],
  location:['sector', 'proposed-sector', 'town', 'bortle'],
  equipment:['camera', 'telescope', 'mount', 'exposure', 'consent']
};
let nextFileId = 1;
let registeredNodeId = '';
const nodeSuffix = String(1000 + Math.floor(Math.random() * 9000)).padStart(4, '0');

function getValue(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function sectorName() {
  return sectorSelect.value === '__propose__' ? getValue('proposed-sector') : sectorSelect.value;
}

function sectorCode(name) {
  if (sectorCodes.has(name)) return sectorCodes.get(name);
  const initials = name.split(/\s+/).map((part) => part[0] || '').join('').toUpperCase();
  const letters = name.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!letters) return 'NEW';
  return initials.length >= 3 ? initials.slice(0, 3) : letters.slice(0, 3).padEnd(3, 'X');
}

function createNodeId(name = sectorName()) {
  return `HEL-${sectorCode(name || '')}-${nodeSuffix}`;
}

function getValidationErrors() {
  const errors = {};
  const callsign = getValue('callsign');
  const email = document.querySelector('#email');
  const sector = sectorSelect.value;
  const proposed = getValue('proposed-sector');
  const town = getValue('town');
  const bortle = Number(document.querySelector('#bortle').value);
  const camera = getValue('camera');
  const telescope = getValue('telescope');
  const mount = document.querySelector('#mount').value;
  const exposure = Number(document.querySelector('#exposure').value);

  if (!/^[A-Za-z0-9_]{3,16}$/.test(callsign)) errors.callsign = 'Use 3–16 letters, numbers, or underscores.';
  else if (nodes.some((node) => node.callsign.toLowerCase().replace(/[^a-z0-9]/g, '') === callsign.toLowerCase().replace(/[^a-z0-9]/g, ''))) errors.callsign = 'That callsign is already in the demo mesh.';
  if (!email.value.trim()) errors.email = 'Enter an email address.';
  else if (!email.validity.valid) errors.email = 'Enter a valid email address.';
  if (!sector) errors.sector = 'Choose a sector or propose a new one.';
  if (sector === '__propose__' && (proposed.length < 2 || proposed.length > 40)) errors['proposed-sector'] = 'Enter a proposed sector name (2–40 characters).';
  if (town.length < 2) errors.town = 'Enter the nearest town or city.';
  if (!Number.isInteger(bortle) || bortle < 1 || bortle > 9) errors.bortle = 'Choose a Bortle class from 1 to 9.';
  if (!camera) errors.camera = 'Enter the camera used at this station.';
  if (!telescope) errors.telescope = 'Enter a telescope or lens.';
  if (!['Tracking', 'Fixed'].includes(mount)) errors.mount = 'Choose tracking or fixed.';
  if (!Number.isInteger(exposure) || exposure < 1 || exposure > 3600) errors.exposure = 'Enter an exposure from 1 to 3,600 seconds.';
  if (!document.querySelector('#consent').checked) errors.consent = 'Consent is required to create a demo profile.';
  return errors;
}

function setFieldState(id, error, reveal) {
  const input = document.querySelector(`#${CSS.escape(id)}`);
  const errorElement = document.querySelector(`#${CSS.escape(id)}-error`);
  if (!input || !errorElement) return;
  const visible = Boolean(error && reveal);
  errorElement.textContent = visible ? error : '';
  errorElement.hidden = !visible;
  if (visible) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function updateProgress(errors) {
  const valid = (ids) => ids.every((id) => !errors[id]);
  const steps = Object.entries(formSteps);
  const firstIncomplete = steps.findIndex(([, ids]) => !valid(ids));
  steps.forEach(([name, ids], index) => {
    const item = document.querySelector(`#progress-${name}`);
    const complete = valid(ids);
    item.classList.toggle('is-complete', complete);
    item.classList.toggle('is-current', !complete && index === (firstIncomplete < 0 ? steps.length - 1 : firstIncomplete));
    if (!complete && index === firstIncomplete) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function updatePreview() {
  const callsign = getValue('callsign');
  const selectedSector = sectorName();
  if (!registeredNodeId) registeredNodeId = createNodeId(selectedSector);
  else if (!selectedSector) registeredNodeId = createNodeId('');
  else if (!registeredNodeId.includes(`-${sectorCode(selectedSector)}-`)) registeredNodeId = createNodeId(selectedSector);
  document.querySelector('#preview-callsign').textContent = callsign || 'YOUR CALLSIGN';
  document.querySelector('#preview-sector').textContent = selectedSector
    ? (sectorSelect.value === '__propose__' ? `Proposed · ${selectedSector}` : selectedSector)
    : 'Select a regional sector';
  document.querySelector('#preview-node-id').textContent = registeredNodeId;
  document.querySelector('#preview-equipment').textContent = [
    getValue('camera'), getValue('telescope'), document.querySelector('#mount').value,
    getValue('filter') ? `${getValue('filter')} filter` : '',
    document.querySelector('#exposure').value ? `${document.querySelector('#exposure').value}s exposures` : ''
  ].filter(Boolean).join(' · ') || 'Your camera and optics will appear here.';
  document.querySelector('#preview-location').textContent = [townInput.value.trim(), selectedSector].filter(Boolean).join(' · ') || 'Your observing site will appear here.';

  const statusText = document.querySelector('#preview-sector-status');
  const statusIndicator = document.querySelector('#sector-status-indicator');
  statusIndicator.className = 'status-indicator';
  if (!selectedSector) statusText.textContent = 'Sector status: awaiting selection';
  else if (sectorSelect.value === '__propose__') {
    statusText.textContent = 'Sector status: proposal pending';
    statusIndicator.classList.add('is-pending');
  } else {
    const onlineCount = nodes.filter((node) => node.sector === selectedSector && node.status === 'online').length;
    statusText.textContent = onlineCount ? `Sector status: active · ${onlineCount} demo nodes online` : 'Sector status: forming · awaiting observers';
    if (onlineCount) statusIndicator.classList.add('is-active');
    else statusIndicator.classList.add('is-pending');
  }
}

function syncFormState(revealErrors = false) {
  const errors = getValidationErrors();
  fieldOrder.forEach((id) => setFieldState(id, errors[id], revealErrors || touched.has(id)));
  submitButton.disabled = Object.keys(errors).length > 0;
  updateProgress(errors);
  updatePreview();
  return errors;
}

function setSampleError(message) {
  sampleError.textContent = message;
  sampleError.hidden = !message;
  if (message) fileInput.setAttribute('aria-invalid', 'true');
  else fileInput.removeAttribute('aria-invalid');
}

function formatFileSize(size) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(file) {
  return (file.name.split('.').pop() || '').toLowerCase();
}

function renderFiles() {
  fileList.replaceChildren();
  uploadCount.textContent = `${files.length} / 3`;
  files.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'sample-file';
    if (imageExtensions.has(fileExtension(entry.file))) {
      const image = document.createElement('img');
      image.className = 'sample-thumb';
      image.src = entry.previewUrl;
      image.alt = `Preview of ${entry.file.name}`;
      row.append(image);
    } else {
      const icon = document.createElement('span');
      icon.className = 'file-type-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ['fit', 'fits'].includes(fileExtension(entry.file)) ? 'FITS' : 'RAW';
      row.append(icon);
    }
    const details = document.createElement('span');
    details.className = 'sample-file-info';
    const name = document.createElement('span');
    name.className = 'sample-file-name';
    name.textContent = entry.file.name;
    const size = document.createElement('span');
    size.className = 'sample-file-size';
    size.textContent = formatFileSize(entry.file.size);
    details.append(name, size);
    const remove = document.createElement('button');
    remove.className = 'remove-file';
    remove.type = 'button';
    remove.dataset.fileId = String(entry.id);
    remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
    remove.textContent = '×';
    row.append(details, remove);
    fileList.append(row);
  });
}

function addFiles(fileListToAdd) {
  const messages = [];
  Array.from(fileListToAdd).forEach((file) => {
    if (files.length >= 3) {
      messages.push('You can add up to 3 sample frames. Extra files were not added.');
      return;
    }
    const extension = fileExtension(file);
    if (!fileExtensions.has(extension)) {
      messages.push(`${file.name}: choose a JPG, PNG, FITS, or supported RAW file.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      messages.push(`${file.name}: each sample frame must be 10 MB or smaller.`);
      return;
    }
    files.push({ id:nextFileId++, file, previewUrl:imageExtensions.has(extension) ? URL.createObjectURL(file) : '' });
  });
  setSampleError(messages.join(' '));
  renderFiles();
}

function findNearestSector(latitude, longitude) {
  const radians = (degrees) => degrees * Math.PI / 180;
  return sectors.reduce((nearest, sector) => {
    const lat1 = radians(latitude);
    const lat2 = radians(sector.lat);
    const deltaLat = lat2 - lat1;
    const deltaLng = radians(sector.lng - longitude);
    const distance = 2 * Math.asin(Math.sqrt(Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2));
    return !nearest || distance < nearest.distance ? { name:sector.name, distance } : nearest;
  }, null)?.name || '';
}

function collectPayload() {
  const selectedSector = sectorName();
  return {
    callsign:getValue('callsign'),
    email:getValue('email'),
    sector:selectedSector,
    proposedSector:sectorSelect.value === '__propose__' ? selectedSector : null,
    town:getValue('town'),
    bortle:Number(document.querySelector('#bortle').value),
    equipment:{
      camera:getValue('camera'),
      telescope:getValue('telescope'),
      mount:document.querySelector('#mount').value,
      filter:getValue('filter') || null,
      typicalExposureSeconds:Number(document.querySelector('#exposure').value)
    },
    sampleFrames:files.map(({ file }) => ({ name:file.name, type:file.type || fileExtension(file), size:file.size })),
    location:locations.latitude === null ? null : { ...locations },
    consent:true
  };
}

function submitRegistration(payload) {
  const registration = { ...payload, nodeId:registeredNodeId || createNodeId(payload.sector), createdAt:new Date().toISOString() };
  // Production: replace this local demo write with a Vercel serverless POST or Formspree request.
  localStorage.setItem('aegis_registered_node', JSON.stringify(registration));
  return registration;
}

function onFormChange(event) {
  const target = event.target;
  if (target.id) touched.add(target.id);
  if (target === sectorSelect) {
    const proposing = sectorSelect.value === '__propose__';
    proposedSectorField.hidden = !proposing;
    proposedSectorInput.required = proposing;
  }
  syncFormState();
}

form.addEventListener('input', onFormChange);
form.addEventListener('change', onFormChange);
form.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || !event.target.matches('input:not([type="checkbox"]):not([type="file"])') || !submitButton.disabled) return;
  event.preventDefault();
  const errors = syncFormState(true);
  const firstInvalid = fieldOrder.find((id) => errors[id]);
  if (firstInvalid) document.querySelector(`#${CSS.escape(firstInvalid)}`)?.focus();
});
form.addEventListener('focusout', (event) => {
  if (event.target.id && fieldOrder.includes(event.target.id)) {
    touched.add(event.target.id);
    syncFormState();
  }
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  touched.add('sample-frames');
  fileInput.value = '';
});
fileList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-file-id]');
  if (!button) return;
  const index = files.findIndex((entry) => entry.id === Number(button.dataset.fileId));
  if (index < 0) return;
  if (files[index].previewUrl) URL.revokeObjectURL(files[index].previewUrl);
  files.splice(index, 1);
  setSampleError('');
  renderFiles();
});
for (const eventName of ['dragenter', 'dragover']) {
  fileDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDropzone.classList.add('is-dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  fileDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDropzone.classList.remove('is-dragging');
  });
}
fileDropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

const useLocationButton = document.querySelector('#use-location');
useLocationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    locationMessage.textContent = 'Location access is unavailable in this browser. You can still enter your town manually.';
    return;
  }
  locationMessage.textContent = 'Requesting location permission…';
  navigator.geolocation.getCurrentPosition((position) => {
    locations.latitude = Number(position.coords.latitude.toFixed(4));
    locations.longitude = Number(position.coords.longitude.toFixed(4));
    const nearest = findNearestSector(locations.latitude, locations.longitude);
    if (!sectorSelect.value || sectorSelect.value === '__propose__') {
      sectorSelect.value = nearest;
      proposedSectorField.hidden = true;
      proposedSectorInput.required = false;
      touched.add('sector');
    }
    locationMessage.textContent = `Location captured (${locations.latitude.toFixed(2)}, ${locations.longitude.toFixed(2)}). Nearest demo sector: ${nearest}. Enter your nearest town above.`;
    syncFormState();
  }, (error) => {
    locationMessage.textContent = error.code === error.PERMISSION_DENIED
      ? 'Location permission was denied. You can still choose a sector and enter your town manually.'
      : 'Could not read your location. You can still choose a sector and enter your town manually.';
  }, { enableHighAccuracy:false, timeout:10000, maximumAge:60000 });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const errors = syncFormState(true);
  if (Object.keys(errors).length) {
    document.querySelector(`#${CSS.escape(fieldOrder.find((id) => errors[id]))}`)?.focus();
    return;
  }
  try {
    const registration = submitRegistration(collectPayload());
    registrationLayout.hidden = true;
    successPanel.hidden = false;
    document.querySelector('#success-node-id').textContent = registration.nodeId;
    document.querySelector('#success-title').focus();
  } catch {
    locationMessage.textContent = 'This browser could not save the demo profile. Check that local storage is available and try again.';
  }
});

window.addEventListener('beforeunload', () => files.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); }));
syncFormState();
