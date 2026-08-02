window.Views = window.Views || {};

Views.Dashboard = (() => {
  async function render() {
    const root = document.getElementById('view-root');
    const [summary, occupancy, upcoming, overdue] = await Promise.all([
      Api.get('/api/dashboard/summary'),
      Api.get('/api/rooms/occupancy'),
      Api.get('/api/vaccines/due/upcoming?days=7'),
      Api.get('/api/vaccines/due/overdue'),
    ]);

    root.innerHTML = `
      <div class="topbar">
        <div>
          <div class="eyebrow">Overview</div>
          <h1>Today at the clinic</h1>
        </div>
      </div>

      <div class="grid grid-5" style="margin-bottom:22px;">
        <div class="card stat-card">
          <div class="label">Active patients</div>
          <div class="value">${summary.totalPatients}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Today's appointments</div>
          <div class="value">${summary.todaysAppointments}</div>
          <div class="sub">${summary.roomsInUseToday} of ${summary.totalRooms} rooms in use</div>
        </div>
        <div class="card stat-card ${summary.vaccinesOverdue ? 'alert' : ''}">
          <div class="label">Vaccines due / overdue</div>
          <div class="value">${summary.vaccinesDueSoon} <span style="font-size:16px; color:var(--ink-soft);">/ ${summary.vaccinesOverdue}</span></div>
          <div class="sub">Due within 7 days / overdue now</div>
        </div>
        <div class="card stat-card good">
          <div class="label">Fees collected</div>
          <div class="value" style="font-size:22px;">${App.fmtMoney(summary.feesCollected)}</div>
          <div class="sub">${App.fmtMoney(summary.feesPending)} pending</div>
        </div>
        <div class="card stat-card ${summary.swarnaCallsDue ? 'alert' : ''}" style="cursor:pointer;" id="swarna-stat-card">
          <div class="label">Swarna Prashana calls due</div>
          <div class="value">${summary.swarnaCallsDue}</div>
          <div class="sub">Not yet called, within 7 days</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:22px;">
        <h3 class="section-title">Therapy rooms &mdash; today</h3>
        <div class="room-pods">
          ${occupancy.rooms.map(roomPod).join('')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3 class="section-title">Vaccines due soon</h3>
          ${renderVaccineList(upcoming, false)}
        </div>
        <div class="card">
          <h3 class="section-title">Overdue vaccines</h3>
          ${renderVaccineList(overdue, true)}
        </div>
      </div>
    `;
    const swarnaCard = document.getElementById('swarna-stat-card');
    if (swarnaCard) swarnaCard.addEventListener('click', () => App.navigate('swarna-prashana'));
  }

  function roomPod(room) {
    const busy = room.sessions.length > 0;
    return `
      <div class="room-pod ${busy ? 'busy' : ''}">
        <div>
          <div class="room-title">${App.escapeHtml(room.room_name)}</div>
          <div class="room-status">${busy
            ? room.sessions.map((s) => `${s.start_time}&ndash;${s.end_time} &middot; ${App.escapeHtml(s.patient_name)}`).join('<br/>')
            : 'Free all day'}</div>
        </div>
        <div class="room-count">${room.sessions.length} session${room.sessions.length === 1 ? '' : 's'}</div>
      </div>
    `;
  }

  function renderVaccineList(rows, overdue) {
    if (!rows.length) {
      return `<div class="empty-state">Nothing to show here.</div>`;
    }
    return `
      <div class="table-wrap"><table>
        <thead><tr><th>Patient</th><th>Vaccine</th><th>Date</th></tr></thead>
        <tbody>
          ${rows.slice(0, 8).map((r) => `
            <tr>
              <td>${App.escapeHtml(r.full_name)}</td>
              <td>${App.escapeHtml(r.vaccine_name)} <span class="badge gray">dose ${r.dose_number}</span></td>
              <td><span class="badge ${overdue ? 'coral' : 'ochre'}">${App.fmtDate(r.scheduled_date)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    `;
  }

  return { render };
})();
