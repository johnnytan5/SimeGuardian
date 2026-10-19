// Dashboard: polls the active tab's endpoint once a second and re-renders it.
const $ = id => document.getElementById(id)
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let tab = 'control'
let selected = 'lee'

const STATUS = {
  null: ['OK', 'ok'], OK: ['OK', 'ok'], RESOLVED: ['Resolved', 'done'],
  CHECKIN_PENDING: ['Check-in pending', 'pending'],
  FAMILY_ESCALATED: ['Escalated: family', 'alert'],
  SECURITY_ESCALATED: ['Escalated: security', 'alert'],
}

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x === b))
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === tab))
  refresh()
})

$('quiet').onclick = () => post('/api/households/lee/quiet').then(refresh)
$('reset').onclick = () => post('/api/reset').then(refresh)
$('speed').onchange = e => post('/api/settings', { speed: Number(e.target.value) })
$('step').onchange = e => post('/api/settings', { stepMs: Number(e.target.value) * 1000 })

function renderControl(s) {
  $('households').innerHTML = s.households.map(h => {
    const [label, cls] = h.consented ? STATUS[h.alert?.state ?? null] : ['Not enrolled', 'off']
    return `<div class="card ${h.id === selected ? 'selected' : ''}" data-id="${h.id}">
      <div class="name">${esc(h.resident)}${h.away ? '<span class="badge">Away</span>' : ''}</div>
      <div class="unit">${esc(h.unit)}</div>
      <span class="chip ${cls}">${label}</span></div>`
  }).join('')
  document.querySelectorAll('.card').forEach(c => c.onclick = () => { selected = c.dataset.id; renderControl(s) })

  const h = s.households.find(x => x.id === selected)
  $('chart-title').textContent = `Activity vs usual pattern — ${h.resident}`
  renderChart(h, s.sim)
  const quietMin = Math.max(0, Math.round((s.sim - h.lastActivity) / 60000))
  $('gap').textContent = `Quiet for ${Math.floor(quietMin / 60)}h ${quietMin % 60}m · alert threshold ${h.thresholdMin / 60}h`
  $('log').innerHTML = s.log.slice().reverse()
    .map(e => `<li><time>${hhmm(e.sim)}</time>${esc(e.text)}</li>`).join('') || '<li class="muted">Nothing yet.</li>'
}

function renderChart(h, sim) {
  const W = 720, H = 170, col = W / 24, max = 5
  const y = v => H - (v / max) * (H - 10)
  const area = h.baseline.map((v, i) => `${i * col + col / 2},${y(v)}`).join(' ')
  const bars = h.today.map((v, i) => v ? `<rect x="${i * col + col * 0.25}" y="${y(v)}" width="${col * 0.5}" height="${H - y(v)}" rx="2" fill="var(--today)"/>` : '').join('')
  const xOf = ms => { const t = new Date(ms); return (t.getHours() + t.getMinutes() / 60) * col }
  const nowX = xOf(sim)
  // Quiet gap since last activity, and where the personal threshold falls on it.
  const sameDay = ms => new Date(ms).toDateString() === new Date(sim).toDateString()
  const quietX = sameDay(h.lastActivity) ? xOf(h.lastActivity) : 0
  const limitMs = h.lastActivity + h.thresholdMin * 60000
  const over = sim > limitMs
  const limitX = sameDay(limitMs) && limitMs <= sim + 6 * 3600000 ? Math.min(xOf(limitMs), W) : null
  const band = nowX - quietX > 1 ? `<rect x="${quietX}" y="0" width="${nowX - quietX}" height="${H}" fill="var(${over ? '--alert' : '--pending'})" opacity=".12"/>` : ''
  const limit = limitX !== null ? `<line x1="${limitX}" x2="${limitX}" y1="0" y2="${H}" stroke="var(--alert)" stroke-dasharray="5 4"/>
    <text x="${limitX + 4}" y="14" font-size="12" fill="var(--alert)">threshold</text>` : ''
  const ticks = [0, 6, 12, 18].map(t => `<text x="${t * col}" y="${H + 20}" font-size="12" fill="var(--muted)">${String(t).padStart(2, '0')}:00</text>`).join('')
  $('chart').innerHTML = `
    <polygon points="${col / 2},${H} ${area} ${W - col / 2},${H}" fill="var(--base)"/>
    ${band}${limit}${bars}
    <line x1="${nowX}" x2="${nowX}" y1="0" y2="${H}" stroke="var(--alert)" stroke-width="2"/>
    <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/>${ticks}`
}

const GUARD_ACTION = { NONE: 'Assign guard', ASSIGNED: 'Mark on the way', ON_THE_WAY: 'Mark arrived — resident safe' }
const GUARD_LABEL = { NONE: 'Waiting', ASSIGNED: 'Assigned', ON_THE_WAY: 'On the way', ARRIVED_SAFE: 'Arrived — resident safe' }

function renderSecurity(items) {
  $('sec-empty').hidden = items.length > 0
  $('sec-rows').innerHTML = items.map(i => `<tr>
    <td>${esc(i.unit)}</td><td>${esc(i.resident)}</td><td>${hhmm(i.escalatedAt)}</td><td>${GUARD_LABEL[i.guard]}</td>
    <td>${GUARD_ACTION[i.guard] ? `<button class="primary" data-id="${i.id}">${GUARD_ACTION[i.guard]}</button>` : ''}</td></tr>`).join('')
  document.querySelectorAll('#sec-rows button').forEach(b => b.onclick = () => post(`/api/households/${b.dataset.id}/guard`).then(refresh))
}

async function refresh() {
  try {
    const s = await (await fetch('/api/state')).json()
    $('clock').textContent = hhmm(s.sim)
    if (document.activeElement !== $('step')) $('step').value = s.stepMs / 1000
    if (document.activeElement !== $('speed')) $('speed').value = String(s.speed)
    if (tab === 'control') renderControl(s)
    if (tab === 'security') renderSecurity(await (await fetch('/api/security')).json())
  } catch { $('clock').textContent = 'offline' }
}

refresh()
setInterval(refresh, 1000)
