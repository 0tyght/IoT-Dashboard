'use strict';
// Preview only: no meter configuration, Modbus reads or persisted measurements.
const powerTab = document.createElement('button');
powerTab.dataset.tab = 'power';
powerTab.textContent = 'ข้อมูลไฟฟ้า';
document.querySelector('.tabs').append(powerTab);
document.querySelectorAll('[data-power-point]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-power-point]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.getElementById('power-selected-point').textContent = button.dataset.powerPoint === 'motor' ? 'ไฟเข้ามอเตอร์' : 'ไฟออกเจเนอเรเตอร์';
  });
});
