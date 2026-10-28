// The wind dial above the speed line: an arrow that shows where the wind blows relative to the bow,
// its strength in knots and the point of sail. Kept out of ui.js, which belongs to the port and treasure work.
import './wind-hud.css';
import { offWind, pointOfSail } from './wind.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createWindHud(parent = document.getElementById('hud')) {
  const root = document.createElement('div');
  root.className = 'wind';
  root.innerHTML = `<svg viewBox="-20 -20 40 40" aria-hidden="true"><circle r="18"/><path class="hull" d="M0-9 4-3 3 8H-3L-4-3Z"/><g class="arrow"><path d="M0 15V-11"/><path d="M-5-6 0-13 5-6"/></g></svg>
    <span><b></b><small></small></span>`;
  parent.appendChild(root);
  const arrow = root.querySelector('.arrow'), knots = root.querySelector('b'), name = root.querySelector('small');
  let shown = '';
  return {
    // The dial turns with the ship: straight up is ahead, the arrow points where the wind goes.
    update(wind, heading) {
      arrow.setAttribute('transform', `rotate(${(-wrap(wind.toward - heading) * 180 / Math.PI).toFixed(1)})`);
      const off = offWind(heading, wind.toward), text = `${Math.round(wind.speed * 1.94)} уз.|${pointOfSail(off)}`;
      if (text + wind.shifting === shown) return;
      shown = text + wind.shifting;
      const [k, n] = text.split('|');
      knots.textContent = `Ветер ${k}`;
      name.textContent = n;
      root.classList.toggle('irons', n === 'Левентик');
      root.classList.toggle('shifting', !!wind.shifting);
    },
  };
}
