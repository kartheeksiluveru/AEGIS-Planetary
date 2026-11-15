const emptyState = document.querySelector('#your-node-empty');
const nodeCard = document.querySelector('#your-node-card');
const badge = document.querySelector('#you-badge');

try {
  const registration = JSON.parse(localStorage.getItem('aegis_registered_node') || 'null');
  if (registration && typeof registration.callsign === 'string' && typeof registration.nodeId === 'string') {
    document.querySelector('#your-callsign').textContent = registration.callsign;
    document.querySelector('#your-node-id').textContent = registration.nodeId;
    document.querySelector('#your-sector').textContent = registration.sector || 'Not specified';
    document.querySelector('#your-town').textContent = registration.town || 'Not specified';
    const equipment = registration.equipment || {};
    document.querySelector('#your-equipment').textContent = [
      equipment.camera, equipment.telescope, equipment.mount,
      equipment.filter, equipment.typicalExposureSeconds ? `${equipment.typicalExposureSeconds}s exposure` : ''
    ].filter(Boolean).join(' · ') || 'Not specified';
    emptyState.hidden = true;
    nodeCard.hidden = false;
    badge.hidden = false;
  }
} catch {
  emptyState.textContent = 'A local demo registration could not be read. You can create a new node profile on the registration page.';
}
