document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let trainees = [];
    let charts = {};
    let selectedTraineeId = null;

    const DB_NAME = 'iteWsdipTrackerDB_v19'; // Final version with all requested features

    // --- AUTOMATED STATUS RULES ---
    const STATUS_RULES = {
        AT_RISK: (m) => m.attendance < 85 || m.competency < 50 || m.engagement < 3.0,
        NEEDS_IMPROVEMENT: (m) => (m.attendance >= 85 && m.attendance <= 90) || (m.competency >= 50 && m.competency <= 70) || (m.engagement >= 3.0 && m.engagement < 4.0),
    };

    // --- DETAILED CHECKLISTS DEFINITION ---
    const CHECKLISTS = {
        "Pre-Onboarding": { "Setup": { po_orientation: "Orientation Attended", po_persona: "Persona Assessed", po_goals: "Preliminary Goals Set" }},
        "Month 1": { "Academic & Work Performance": { m1_academic_progress: "Discuss Academic Progress", m1_work_performance: "Review Trainee's Work Performance", m1_workplace_challenges: "Identify Workplace Challenges" }, "Goals & Support": { m1_review_goals: "Review Progress Towards Goals", m1_support_needs: "Review Support Needs", m1_skill_gaps: "Identify Skill Gaps (COC)" }},
        "Month 3": { "Academic & Performance": { m3_track_attendance: "Track School Attendance", m3_assess_attitude: "Assess Attitude and Contribution", m3_identify_gaps: "Identify Gaps for Improvement", m3_discuss_strategies: "Discuss Strategies for Success" }, "Goals & Support": { m3_support_follow_up: "Follow-up on Support Status", m3_monitor_wellbeing: "Continue to Monitor Well-being" }},
        "Month 6": { "Academic & Performance": { m6_eval_academic: "Evaluate Trainee's Academic Progress", m6_eval_overall: "Evaluate Overall Performance & Skills", m6_review_gaps: "Evaluate and Review Performance Gaps" }, "Goals & Support": { m6_review_strategies: "Review Effectiveness of Strategies", m6_monitor_wellbeing: "Continue to Monitor Well-being" }}
    };

    function calculateStatus(metrics) {
        if (!metrics || typeof metrics.competency === 'undefined') return 'On Track';
        if (STATUS_RULES.AT_RISK(metrics)) return 'At-Risk';
        if (STATUS_RULES.NEEDS_IMPROVEMENT(metrics)) return 'Needs Improvement';
        return 'On Track';
    }

    // --- DATA HANDLING & VIEW SWITCHING ---
    function loadData() { trainees = JSON.parse(localStorage.getItem(DB_NAME)) || generateSampleData(); }
    function saveData() { localStorage.setItem(DB_NAME, JSON.stringify(trainees)); }
    
    function showView(viewId, traineeId = null) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`${viewId}-view`);
        if (view) view.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const navBtn = document.getElementById(`nav-${viewId}`);
        if(navBtn) navBtn.classList.add('active');

        Object.values(charts).forEach(c => c.destroy());
        charts = {};

        switch (viewId) {
            case 'dashboard': renderDashboard(); break;
            case 'manage': renderManageView(); break;
            case 'profile': renderProfileView(traineeId); break;
        }
    }

    // --- RENDER FUNCTIONS ---
    // --- MODIFIED FUNCTION ---
    function renderDashboard() {
        const view = document.getElementById('dashboard-view');
        // MODIFIED: Updated HTML for summary cards to include all 3 metrics
        view.innerHTML = `
            <div class="dashboard-grid kpi-grid">
                <div class="card kpi-card"><h3>Active / Total</h3><div class="value" id="kpi-total">0/0</div></div>
                <div class="card kpi-card"><h3>Retention Rate</h3><div class="value" id="kpi-retention">0%</div></div>
            </div>
            <div class="card attention-panel"><h3>Attention Needed</h3><ul id="attention-list"></ul></div>
            <h3>Status Summary</h3>
            <div class="dashboard-grid summary-grid">
                <div class="card summary-card on-track"><h3>On Track</h3><div class="details"><span class="count" id="summary-on-track-count">0</span><span class="avg-metrics">Avg: C:<b id="summary-on-track-comp">0%</b> A:<b id="summary-on-track-att">0%</b> E:<b id="summary-on-track-eng">0</b></span></div></div>
                <div class="card summary-card needs-improvement"><h3>Needs Improvement</h3><div class="details"><span class="count" id="summary-needs-improvement-count">0</span><span class="avg-metrics">Avg: C:<b id="summary-needs-improvement-comp">0%</b> A:<b id="summary-needs-improvement-att">0%</b> E:<b id="summary-needs-improvement-eng">0</b></span></div></div>
                <div class="card summary-card at-risk"><h3>At-Risk</h3><div class="details"><span class="count" id="summary-at-risk-count">0</span><span class="avg-metrics">Avg: C:<b id="summary-at-risk-comp">0%</b> A:<b id="summary-at-risk-att">0%</b> E:<b id="summary-at-risk-eng">0</b></span></div></div>
            </div>
            <div class="dashboard-grid charts-grid" style="grid-template-columns: repeat(3, 1fr);">
                <div class="card"><h3>Competency Progress</h3><div class="chart-container"><canvas id="competency-progress-chart"></canvas></div></div>
                <div class="card"><h3>Attendance Rate</h3><div class="chart-container"><canvas id="attendance-chart"></canvas></div></div>
                <div class="card"><h3>Engagement Score</h3><div class="chart-container"><canvas id="engagement-chart"></canvas></div></div>
                <div class="card" style="grid-column: 1 / 3;"><h3>Overall Checklist Completion</h3><div class="chart-container"><canvas id="checklist-chart"></canvas></div></div>
                <div class="card"><h3>Phase Distribution</h3><div class="chart-container"><canvas id="phase-chart"></canvas></div></div>
            </div>
            <div class="card table-container">
                <div class="table-header"><h2>Master Trainee Roster</h2></div>
                <div class="table-wrapper"><table><thead><tr><th>Name</th><th>Current Phase</th><th>Status</th></tr></thead><tbody id="dashboard-table-body"></tbody></table></div>
            </div>`;

        const activeTrainees = trainees.filter(t => t.status !== 'Withdrawn');
        view.querySelector('#kpi-total').textContent = `${activeTrainees.length}/${trainees.length}`;
        const retention = trainees.length > 0 ? (activeTrainees.length / trainees.length * 100) : 0;
        view.querySelector('#kpi-retention').textContent = `${retention.toFixed(1)}%`;
        
        const statusGroups = { "On Track": [], "Needs Improvement": [], "At-Risk": [] };
        activeTrainees.forEach(t => statusGroups[calculateStatus(t.metrics)].push(t));
        
        // MODIFIED: Loop to calculate and display all 3 averages
        for (const status in statusGroups) {
            const group = statusGroups[status];
            const slug = status.toLowerCase().replace(' ', '-');
            view.querySelector(`#summary-${slug}-count`).textContent = group.length;
            
            const metricTrainees = group.filter(t => t.metrics?.competency);
            if(metricTrainees.length > 0){
                const avgComp = metricTrainees.reduce((s, t) => s + t.metrics.competency, 0) / metricTrainees.length;
                const avgAtt = metricTrainees.reduce((s, t) => s + t.metrics.attendance, 0) / metricTrainees.length;
                const avgEng = metricTrainees.reduce((s, t) => s + t.metrics.engagement, 0) / metricTrainees.length;
                
                view.querySelector(`#summary-${slug}-comp`).textContent = `${avgComp.toFixed(1)}%`;
                view.querySelector(`#summary-${slug}-att`).textContent = `${avgAtt.toFixed(1)}%`;
                view.querySelector(`#summary-${slug}-eng`).textContent = `${avgEng.toFixed(1)}`;
            } else {
                 view.querySelector(`#summary-${slug}-comp`).textContent = 'N/A';
                 view.querySelector(`#summary-${slug}-att`).textContent = 'N/A';
                 view.querySelector(`#summary-${slug}-eng`).textContent = 'N/A';
            }
        }
        
        const attentionList = view.querySelector('#attention-list');
        const tableBody = view.querySelector('#dashboard-table-body');
        attentionList.innerHTML = ''; tableBody.innerHTML = '';
        trainees.forEach(t => {
            const status = t.status === 'Withdrawn' ? 'Withdrawn' : calculateStatus(t.metrics);
            if (status === 'At-Risk' && t.status !== 'Withdrawn') {
                const li = document.createElement('li');
                li.innerHTML = `❗ <b>${t.name}</b> is currently At-Risk.`; li.dataset.traineeId = t.id;
                attentionList.appendChild(li);
            }
            const row = document.createElement('tr'); row.dataset.traineeId = t.id;
            row.innerHTML = `<td>${t.name}</td><td>${t.phase}</td><td><span class="status status-${status.toLowerCase().replace(' ', '-')}">${status}</span></td>`;
            tableBody.appendChild(row);
        });
        if (attentionList.children.length === 0) attentionList.innerHTML = '<li>✅ All trainees are on track!</li>';

        renderDashboardCharts();
    }
    
    function renderDashboardCharts(){
        const activeTrainees = trainees.filter(t => t.status !== 'Withdrawn');
        const phaseOrder = ["Pre-Onboarding", "Month 1", "Month 3", "Month 6"];
        
        // Overall Checklist Completion Logic
        const checklistCompletionData = phaseOrder.map(phase => {
            const phaseIndex = phaseOrder.indexOf(phase);
            const relevantTrainees = activeTrainees.filter(t => {
                 for (let i = phaseIndex; i < phaseOrder.length; i++) { if (t.phaseData[phaseOrder[i]]?.snapshot) return true; } return false;
            });
            if (relevantTrainees.length === 0) return 0;
            const checklistGroups = CHECKLISTS[phase];
            const totalItemsInPhase = Object.values(checklistGroups).reduce((sum, group) => sum + Object.keys(group).length, 0);
            let totalPossible = relevantTrainees.length * totalItemsInPhase;
            let totalCompleted = 0;
            relevantTrainees.forEach(t => {
                const phaseChecklistData = t.phaseData[phase]?.checklist || {};
                totalCompleted += Object.values(phaseChecklistData).filter(Boolean).length;
            });
            return totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;
        });
        
        const getBarColor = (value) => {
            if (value >= 90) return 'var(--success)'; if (value >= 70) return 'var(--warning)'; return 'var(--danger)';
        };
        charts.checklist = new Chart(document.getElementById('checklist-chart').getContext('2d'), {
            type: 'bar',
            data: { labels: phaseOrder, datasets: [{ label: 'Completion %', data: checklistCompletionData, backgroundColor: checklistCompletionData.map(getBarColor) }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.raw.toFixed(1)}% Complete` } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => value + '%' } } } }
        });

        // Competency Progress by Phase Chart
        const competencyPhaseLabels = phaseOrder.filter(p => p !== 'Pre-Onboarding');
        const competencyProgressData = competencyPhaseLabels.map(phase => {
            const relevantTrainees = activeTrainees.filter(t => t.phaseData[phase]?.snapshot?.metrics);
            if(relevantTrainees.length === 0) return 0;
            const totalCompetency = relevantTrainees.reduce((sum, t) => sum + t.phaseData[phase].snapshot.metrics.competency, 0);
            return totalCompetency / relevantTrainees.length;
        });
        charts.competencyProgress = new Chart(document.getElementById('competency-progress-chart').getContext('2d'), {
            type: 'line',
            data: { labels: competencyPhaseLabels, datasets: [{ label: 'Average Competency', data: competencyProgressData, borderColor: 'var(--ite-blue)', backgroundColor: 'rgba(21, 101, 192, 0.1)', fill: true, tension: 0.1 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => value + '%' } } }, plugins: { legend: { display: false } } }
        });

        // Attendance Rate by Phase Chart
        const attendancePhaseLabels = phaseOrder.filter(p => p !== 'Pre-Onboarding');
        const attendanceProgressData = attendancePhaseLabels.map(phase => {
            const relevantTrainees = activeTrainees.filter(t => t.phaseData[phase]?.snapshot?.metrics);
            if(relevantTrainees.length === 0) return 0;
            const totalAttendance = relevantTrainees.reduce((sum, t) => sum + t.phaseData[phase].snapshot.metrics.attendance, 0);
            return totalAttendance / relevantTrainees.length;
        });
        charts.attendance = new Chart(document.getElementById('attendance-chart').getContext('2d'), {
            type: 'line',
            data: {
                labels: attendancePhaseLabels,
                datasets: [{ label: 'Average Attendance', data: attendanceProgressData, borderColor: 'var(--success)', backgroundColor: 'rgba(40, 167, 69, 0.1)', fill: true, tension: 0.1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => value + '%' } } }, plugins: { legend: { display: false } } }
        });

        // Engagement Score by Phase Chart
        const engagementPhaseLabels = phaseOrder.filter(p => p !== 'Pre-Onboarding');
        const engagementProgressData = engagementPhaseLabels.map(phase => {
            const relevantTrainees = activeTrainees.filter(t => t.phaseData[phase]?.snapshot?.metrics);
            if(relevantTrainees.length === 0) return 0;
            const totalEngagement = relevantTrainees.reduce((sum, t) => sum + t.phaseData[phase].snapshot.metrics.engagement, 0);
            return totalEngagement / relevantTrainees.length;
        });
        charts.engagement = new Chart(document.getElementById('engagement-chart').getContext('2d'), {
            type: 'line',
            data: {
                labels: engagementPhaseLabels,
                datasets: [{ label: 'Average Engagement', data: engagementProgressData, borderColor: 'var(--warning)', backgroundColor: 'rgba(255, 193, 7, 0.1)', fill: true, tension: 0.1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 5 } }, plugins: { legend: { display: false } } }
        });
        
        // Phase Distribution Chart
        charts.phase = new Chart(document.getElementById('phase-chart').getContext('2d'), {
            type: 'doughnut',
            data: { labels: phaseOrder, datasets: [{ data: phaseOrder.map(p => activeTrainees.filter(t => t.phase === p).length), backgroundColor: ['#6c757d', '#17a2b8', '#ffc107', '#28a745'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- MANAGE & PROFILE VIEW RENDERING (UNCHANGED) ---
    function renderManageView() { /* ... Unchanged ... */ }
    function renderForm() { /* ... Unchanged ... */ }
    function renderProfileView(traineeId) { /* ... Unchanged ... */ }
    
    // --- FORM LOGIC & UI UPDATES (UNCHANGED) ---
    function updateFormUI(phase) { /* ... Unchanged ... */ }
    function updateLiveStatus() { /* ... Unchanged ... */ }
    
    // --- EVENT HANDLERS (UNCHANGED) ---
    document.body.addEventListener('click', (e) => { /* ... Unchanged ... */ });
    document.body.addEventListener('submit', (e) => { /* ... Unchanged ... */ });
    document.body.addEventListener('input', (e) => { /* ... Unchanged ... */ });
    
    // --- HELPERS & INITIALIZATION ---
    function showToast(message, type = 'success') { /* ... Unchanged ... */ }
    
    // --- MODIFIED FUNCTION ---
    function generateSampleData() {
        return [
            // 1. High-Performer: Excels in all areas, now in Month 6.
            { id: 1, name: "Alicia Tan", phase: "Month 6", status: "Active", metrics: { competency: 95, engagement: 4.8, attendance: 99 }, interactionLog: [{timestamp: "2024-03-15T10:00:00.000Z", text:"Final review scheduled with mentor. Company is very pleased."},{timestamp: "2023-11-20T14:00:00.000Z", text:"Showed great initiative on a new project."}], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true, po_persona:true, po_goals:true}, notes:"Very motivated and prepared.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true, m1_work_performance:true, m1_workplace_challenges:true, m1_review_goals:true, m1_support_needs:true}, notes:"Excellent start. Adapting well.", snapshot: { metrics: { competency: 78, engagement: 4.5, attendance: 100 } } }, "Month 3": { checklist: {m3_track_attendance:true, m3_assess_attitude:true, m3_identify_gaps:true}, notes:"Consistently high performance.", snapshot: { metrics: { competency: 88, engagement: 4.7, attendance: 98 }}}, "Month 6": { checklist: {m6_eval_overall:true}, notes: "", snapshot: { metrics: { competency: 95, engagement: 4.8, attendance: 99 }} } } },
            // 2. Solid Performer: Needs some improvement but is generally good.
            { id: 2, name: "Benny Chen", phase: "Month 3", status: "Active", metrics: { competency: 72, engagement: 4.1, attendance: 92 }, interactionLog: [], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true, po_goals:true}, notes:"Seems quiet but focused.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true, m1_work_performance:true}, notes:"Struggled slightly with one software but caught up.", snapshot: { metrics: { competency: 65, engagement: 3.8, attendance: 94 } } }, "Month 3": { checklist: {m3_track_attendance:true}, notes: "", snapshot: { metrics: { competency: 72, engagement: 4.1, attendance: 92 }} } } },
            // 3. At-Risk Student: Consistently low performance.
            { id: 3, name: "Charles Lim", phase: "Month 3", status: "Active", metrics: { competency: 48, engagement: 2.9, attendance: 84 }, interactionLog: [{timestamp: "2024-01-22T09:30:00.000Z", text:"Performance Improvement Plan initiated."},{timestamp: "2023-11-05T09:30:00.000Z", text:"Called company to discuss attendance issues."}], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true}, notes:"Appeared disengaged during orientation.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true}, notes: "Mentor reports frequent tardiness.", snapshot: { metrics: { competency: 55, engagement: 3.1, attendance: 88 }} }, "Month 3": { checklist: {m3_track_attendance:true, m3_assess_attitude:true, m3_identify_gaps:true, m3_discuss_strategies:true}, notes: "", snapshot: { metrics: { competency: 48, engagement: 2.9, attendance: 84 }} } } },
            // 4. Withdrawn Student: Left the program at Month 3.
            { id: 4, name: "Diana Woo", phase: "Month 3", status: "Withdrawn", metrics: {}, interactionLog: [], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true}, snapshot:{metrics:{}}}, "Month 1":{checklist:{m1_academic_progress:true}, notes:"Struggled with the daily commute.", snapshot:{metrics:{competency:60, engagement:3.5, attendance:90}}}, "Month 3": {snapshot:{metrics:{competency:50, engagement:3.1, attendance:85}}, checklist:{}, notes:"Decided to withdraw from the program due to personal reasons."} } },
            // 5. New Student: Just started, only Pre-Onboarding is done.
            { id: 5, name: "Emily Hassan", phase: "Pre-Onboarding", status: "Active", metrics: {}, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, notes: "Completed initial setup.", snapshot: { metrics: {} } } } },
            // 6. Improving Student: Was At-Risk, now Needs Improvement.
            { id: 6, name: "Farhan Ibrahim", phase: "Month 3", status: "Active", metrics: { competency: 68, engagement: 4.0, attendance: 91 }, interactionLog: [{timestamp: "2024-01-10T11:00:00.000Z", text:"Positive follow-up call. Attitude has improved significantly."}], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, notes: "Low engagement and poor initial competency.", snapshot: { metrics: { competency: 45, engagement: 3.2, attendance: 88 } } }, "Month 3": { checklist: { m3_track_attendance:true, m3_assess_attitude:true }, notes: "Showing great improvement after intervention.", snapshot: { metrics: { competency: 68, engagement: 4.0, attendance: 91 } } } } },
            // 7. Month 1 Student - On Track.
            { id: 7, name: "Grace Ong", phase: "Month 1", status: "Active", metrics: { competency: 75, engagement: 4.2, attendance: 97 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_persona: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true, m1_work_performance: true }, snapshot: { metrics: { competency: 75, engagement: 4.2, attendance: 97 } } } } },
            // 8. Student with Declining Performance.
            { id: 8, name: "Henry Kumar", phase: "Month 6", status: "Active", metrics: { competency: 62, engagement: 3.7, attendance: 89 }, interactionLog: [{timestamp: "2024-03-05T16:00:00.000Z", text:"Mentor reported a drop in motivation recently."}], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 80, engagement: 4.4, attendance: 98 } } }, "Month 3": { checklist: { m3_track_attendance: true }, snapshot: { metrics: { competency: 75, engagement: 4.0, attendance: 95 } } }, "Month 6": { checklist: { m6_eval_academic: true }, snapshot: { metrics: { competency: 62, engagement: 3.7, attendance: 89 } } } } },
            // 9. Average Student in Month 6 - All checklists partially done.
            { id: 9, name: "Isabelle Chan", phase: "Month 6", status: "Active", metrics: { competency: 78, engagement: 4.3, attendance: 94 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 70, engagement: 4.0, attendance: 95 } } }, "Month 3": { checklist: { m3_track_attendance: true }, snapshot: { metrics: { competency: 75, engagement: 4.2, attendance: 96 } } }, "Month 6": { checklist: { m6_eval_academic: true }, snapshot: { metrics: { competency: 78, engagement: 4.3, attendance: 94 } } } } },
            // 10. A new Month 1 student who missed pre-onboarding checklist.
            { id: 10, name: "Jacky Lee", phase: "Month 1", status: "Active", metrics: { competency: 68, engagement: 3.9, attendance: 93 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: {}, notes: "Joined late, missed orientation.", snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 68, engagement: 3.9, attendance: 93 } } } } }
        ];
    }
    
    // --- Initial Load ---
    loadData();
    showView('dashboard');

    // --- RE-INTEGRATION of UNCHANGED functions from your provided code ---
    function renderManageView() {
        const view = document.getElementById('manage-view');
        view.innerHTML = `<div class="manage-layout"><div class="trainee-list-panel"><button id="add-new-trainee-btn" class="btn-primary">Add New Trainee</button><ul id="manage-trainee-list"></ul></div><div class="form-panel"><form id="trainee-form"></form></div></div>`;
        const traineeList = view.querySelector('#manage-trainee-list');
        trainees.sort((a,b) => a.name.localeCompare(b.name)).forEach(t => {
            const li = document.createElement('li');
            li.textContent = t.name; li.dataset.traineeId = t.id;
            if (t.id === selectedTraineeId) li.classList.add('selected');
            traineeList.appendChild(li);
        });
        renderForm();
    }
    function renderForm() {
        const formContainer = document.getElementById('trainee-form');
        const trainee = trainees.find(t => t.id === selectedTraineeId);
        const phaseOptions = ["Pre-Onboarding", "Month 1", "Month 3", "Month 6"];
        const phaseModulesHTML = phaseOptions.map(phase => {
            const pKey = phase.toLowerCase().replace(' ', '-');
            const checklistGroups = CHECKLISTS[phase];
            return `<div id="${pKey}-module" class="phase-module"><fieldset><legend>${phase} Review</legend>${Object.entries(checklistGroups).map(([groupName, items]) => `<div class="checklist-group"><h4>${groupName}</h4>${Object.entries(items).map(([key, label]) => `<div class="checkbox-item"><input type="checkbox" id="${key}" ${trainee?.phaseData?.[phase]?.checklist?.[key] ? 'checked' : ''}> <label for="${key}">${label}</label></div>`).join('')}</div>`).join('')}</fieldset><div class="form-group"><label for="${pKey}-notes">Notes</label><textarea id="${pKey}-notes" rows="3">${trainee?.phaseData?.[phase]?.notes || ''}</textarea></div></div>`;
        }).join('');
        formContainer.innerHTML = `<div class="form-header"><h2>${trainee ? `Editing: ${trainee.name}` : 'Add New Trainee'}</h2><div id="live-status-indicator"></div></div><div class="form-group"><label for="form-name">Trainee Name</label><input type="text" id="form-name" required value="${trainee?.name || ''}"></div><div class="form-group"><label for="form-phase">Current Phase</label><select id="form-phase">${phaseOptions.map(p => `<option value="${p}" ${trainee?.phase === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>${phaseModulesHTML}<div id="quantitative-metrics"><div class="form-group"><label for="form-attendance">Attendance (%)</label><input type="number" id="form-attendance" min="0" max="100" value="${trainee?.metrics?.attendance ?? ''}"></div><div class="form-group"><label for="form-competency">Competency (%)</label><input type="number" id="form-competency" min="0" max="100" value="${trainee?.metrics?.competency ?? ''}"></div><div class="form-group"><label for="form-engagement">Engagement</label><input type="number" id="form-engagement" min="1" max="5" step="0.1" value="${trainee?.metrics?.engagement ?? ''}"></div></div><div class="form-group"><label for="form-status">Overall Status</label><select id="form-status"><option value="Active" ${!trainee || trainee.status !== 'Withdrawn' ? 'selected' : ''}>Active</option><option value="Withdrawn" ${trainee?.status === 'Withdrawn' ? 'selected' : ''}>Withdrawn</option></select></div><div class="button-group"><button type="submit" class="btn-primary">${trainee ? 'Save Changes' : 'Add Trainee'}</button>${trainee ? `<button type="button" id="delete-btn" class="btn-danger">Delete</button>`: ''}</div>`;
        updateFormUI(trainee ? trainee.phase : 'Pre-Onboarding');
        if (trainee) updateLiveStatus();
    }
    function renderProfileView(traineeId) {
        const view = document.getElementById('profile-view');
        const trainee = trainees.find(t => t.id === traineeId);
        if (!trainee) { view.innerHTML = '<h2>Trainee not found</h2>'; return; }
        const currentStatus = trainee.status === 'Withdrawn' ? 'Withdrawn' : calculateStatus(trainee.metrics);
        const timelineHTML = Object.entries(trainee.phaseData).map(([phase, data], index) => {
            if (!data.snapshot) return '';
            const status = calculateStatus(data.snapshot.metrics);
            const checklistHTML = Object.entries(CHECKLISTS[phase]).map(([groupName, items]) => {
                const completedItems = Object.keys(items).filter(key => data.checklist[key]);
                if (completedItems.length === 0) return '';
                return `<div class="profile-checklist-group"><strong>${groupName}:</strong> ${completedItems.map(key => items[key]).join(', ')}</div>`;
            }).join('');
            const metricsChartHTML = (phase !== 'Pre-Onboarding' && data.snapshot.metrics) ? `<div class="chart-container" style="height: 150px; margin-top: 1rem;"><canvas id="timeline-chart-${index}"></canvas></div>` : '';
            return `<div class="timeline-item"><h4>${phase} <span class="status status-${status.toLowerCase().replace(' ', '-')}">${status}</span></h4><div class="timeline-content">${checklistHTML || '<p>No checklist items marked.</p>'}${metricsChartHTML}<div class="notes"><strong>Notes:</strong> ${data.notes || 'No notes for this phase.'}</div></div></div>`;
        }).join('');
        const logHTML = (trainee.interactionLog || []).map(log => `<div class="log-item"><small>${new Date(log.timestamp).toLocaleString()}</small><p>${log.text}</p></div>`).join('');
        view.innerHTML = `<div class="profile-header"><div><h2>${trainee.name}</h2><span class="status status-${currentStatus.toLowerCase().replace(' ', '-')}">Current Status: ${currentStatus}</span></div><button class="btn-secondary" data-trainee-id="${trainee.id}" id="edit-from-profile-btn">Edit Trainee</button></div><div class="profile-main"><div class="timeline">${timelineHTML || '<p>No saved progress to display.</p>'}</div><div class="profile-sidebar"><div class="card"><h3>Interaction Log</h3><div id="interaction-log-list">${logHTML || '<p>No interactions logged.</p>'}</div><form id="log-form" class="form-group"><textarea id="log-input" rows="3" placeholder="Add new log entry..."></textarea><button type="submit" class="btn-primary" style="margin-top: 0.5rem;">Add Log</button></form></div></div></div>`;
        setTimeout(() => {
            Object.entries(trainee.phaseData).forEach(([phase, data], index) => {
                if (phase !== 'Pre-Onboarding' && data.snapshot?.metrics) {
                    const canvas = document.getElementById(`timeline-chart-${index}`);
                    if (!canvas) return;
                    charts[`timeline-${index}`] = new Chart(canvas.getContext('2d'), { type: 'bar', data: { labels: ['Competency', 'Attendance', 'Engagement'], datasets: [{ data: [ data.snapshot.metrics.competency, data.snapshot.metrics.attendance, (data.snapshot.metrics.engagement || 0) * 20 ], backgroundColor: ['var(--ite-blue)', 'var(--success)', 'var(--warning)'] }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { if (context.label === 'Engagement') { return ` ${(context.raw / 20).toFixed(1)} / 5.0`; } return ` ${context.raw}%`; } } } }, scales: { x: { max: 100, beginAtZero: true, ticks: { callback: (value) => value + '%' } } } } });
                }
            });
        }, 0);
    }
    function updateFormUI(phase) {
        const form = document.getElementById('trainee-form');
        if (!form) return;
        form.querySelectorAll('.phase-module').forEach(m => m.style.display = 'none');
        const module = form.querySelector(`#${phase.toLowerCase().replace(' ', '-')}-module`);
        if (module) module.style.display = 'block';
        form.querySelector('#quantitative-metrics').style.display = (phase !== 'Pre-Onboarding') ? 'grid' : 'none';
    }
    function updateLiveStatus() {
        const form = document.getElementById('trainee-form');
        if (!form) return;
        const metrics = { attendance: parseInt(form.querySelector('#form-attendance')?.value) || undefined, competency: parseInt(form.querySelector('#form-competency')?.value) || undefined, engagement: parseFloat(form.querySelector('#form-engagement')?.value) || undefined };
        const status = calculateStatus(metrics);
        const indicator = form.querySelector('#live-status-indicator');
        if (indicator) indicator.innerHTML = `<span class="status status-${status.toLowerCase().replace(' ', '-')}">${status}</span>`;
    }
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'nav-dashboard') { showView('dashboard'); return; }
        if (e.target.id === 'nav-manage') { showView('manage'); return; }
        const attentionLi = e.target.closest('#attention-list li');
        if (attentionLi?.dataset.traineeId) { showView('profile', parseInt(attentionLi.dataset.traineeId)); return; }
        const tableRow = e.target.closest('#dashboard-table-body tr');
        if (tableRow?.dataset.traineeId) { showView('profile', parseInt(tableRow.dataset.traineeId)); return; }
        const manageLi = e.target.closest('#manage-trainee-list li');
        if (manageLi?.dataset.traineeId) { selectedTraineeId = parseInt(manageLi.dataset.traineeId); renderManageView(); return; }
        if (e.target.id === 'add-new-trainee-btn') { selectedTraineeId = null; renderManageView(); return; }
        if (e.target.id === 'edit-from-profile-btn') { selectedTraineeId = parseInt(e.target.dataset.traineeId); showView('manage'); return; }
        if (e.target.id === 'delete-btn') {
            const traineeToDelete = trainees.find(t => t.id === selectedTraineeId);
            if (traineeToDelete && confirm(`Are you sure you want to delete ${traineeToDelete.name}?`)){
                trainees = trainees.filter(t => t.id !== selectedTraineeId);
                selectedTraineeId = null;
                saveData();
                renderManageView();
                showToast(`${traineeToDelete.name} deleted.`, 'error');
            }
            return;
        }
    });
    document.body.addEventListener('submit', (e) => {
        if (e.target.id === 'trainee-form'){
            e.preventDefault();
            const form = e.target;
            const name = form.querySelector('#form-name').value;
            if(!name.trim()){ showToast('Trainee name is required.', 'error'); return; }
            const currentPhase = form.querySelector('#form-phase').value;
            const currentModule = form.querySelector(`#${currentPhase.toLowerCase().replace(' ', '-')}-module`);
            const currentPhaseUpdate = { checklist: {}, notes: currentModule.querySelector('textarea').value };
            currentModule.querySelectorAll('input[type="checkbox"]').forEach(c => currentPhaseUpdate.checklist[c.id] = c.checked);
            let metrics = {};
            if (currentPhase !== 'Pre-Onboarding') {
                metrics = { attendance: parseInt(form.querySelector('#form-attendance').value) || 0, competency: parseInt(form.querySelector('#form-competency').value) || 0, engagement: parseFloat(form.querySelector('#form-engagement').value) || 0 };
            }
            currentPhaseUpdate.snapshot = { metrics: { ...metrics } };
            if (selectedTraineeId) {
                const trainee = trainees.find(t => t.id === selectedTraineeId);
                trainee.name = name.trim();
                trainee.phase = currentPhase;
                trainee.status = form.querySelector('#form-status').value;
                trainee.metrics = metrics;
                trainee.phaseData[currentPhase] = currentPhaseUpdate;
            } else {
                const newTrainee = { id: Date.now(), name: name.trim(), phase: currentPhase, status: form.querySelector('#form-status').value, metrics: metrics, phaseData: { [currentPhase]: currentPhaseUpdate }, interactionLog: [] };
                trainees.push(newTrainee);
                selectedTraineeId = newTrainee.id;
            }
            saveData();
            showToast(`${name.trim()}'s record saved.`);
            renderManageView();
        }
        if (e.target.id === 'log-form'){
            e.preventDefault();
            const input = e.target.querySelector('#log-input');
            const text = input.value.trim();
            if (text) {
                const profileBtn = document.querySelector('#edit-from-profile-btn');
                const traineeId = parseInt(profileBtn.dataset.traineeId);
                const trainee = trainees.find(t => t.id === traineeId);
                if (!trainee.interactionLog) trainee.interactionLog = [];
                trainee.interactionLog.unshift({ timestamp: new Date().toISOString(), text });
                saveData();
                renderProfileView(traineeId);
            }
        }
    });
    document.body.addEventListener('input', (e) => {
        const form = e.target.closest('#trainee-form');
        if(!form) return;
        if(e.target.closest('#quantitative-metrics')) { updateLiveStatus(); }
        if(e.target.id === 'form-phase') { updateFormUI(e.target.value); }
    });
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast-notification');
        toast.textContent = message; toast.className = `toast show ${type}`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
    function generateSampleData() {
        return [
            { id: 1, name: "Alicia Tan", phase: "Month 6", status: "Active", metrics: { competency: 95, engagement: 4.8, attendance: 99 }, interactionLog: [{timestamp: "2024-03-15T10:00:00.000Z", text:"Final review scheduled with mentor. Company is very pleased."},{timestamp: "2023-11-20T14:00:00.000Z", text:"Showed great initiative on a new project."}], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true, po_persona:true, po_goals:true}, notes:"Very motivated and prepared.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true, m1_work_performance:true, m1_workplace_challenges:true, m1_review_goals:true, m1_support_needs:true}, notes:"Excellent start. Adapting well.", snapshot: { metrics: { competency: 78, engagement: 4.5, attendance: 100 } } }, "Month 3": { checklist: {m3_track_attendance:true, m3_assess_attitude:true, m3_identify_gaps:true}, notes:"Consistently high performance.", snapshot: { metrics: { competency: 88, engagement: 4.7, attendance: 98 }}}, "Month 6": { checklist: {m6_eval_overall:true}, notes: "", snapshot: { metrics: { competency: 95, engagement: 4.8, attendance: 99 }} } } },
            { id: 2, name: "Benny Chen", phase: "Month 3", status: "Active", metrics: { competency: 72, engagement: 4.1, attendance: 92 }, interactionLog: [], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true, po_goals:true}, notes:"Seems quiet but focused.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true, m1_work_performance:true}, notes:"Struggled slightly with one software but caught up.", snapshot: { metrics: { competency: 65, engagement: 3.8, attendance: 94 } } }, "Month 3": { checklist: {m3_track_attendance:true}, notes: "", snapshot: { metrics: { competency: 72, engagement: 4.1, attendance: 92 }} } } },
            { id: 3, name: "Charles Lim", phase: "Month 3", status: "Active", metrics: { competency: 48, engagement: 2.9, attendance: 84 }, interactionLog: [{timestamp: "2024-01-22T09:30:00.000Z", text:"Performance Improvement Plan initiated."},{timestamp: "2023-11-05T09:30:00.000Z", text:"Called company to discuss attendance issues."}], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true}, notes:"Appeared disengaged during orientation.", snapshot:{metrics:{}}}, "Month 1": { checklist: {m1_academic_progress:true}, notes: "Mentor reports frequent tardiness.", snapshot: { metrics: { competency: 55, engagement: 3.1, attendance: 88 }} }, "Month 3": { checklist: {m3_track_attendance:true, m3_assess_attitude:true, m3_identify_gaps:true, m3_discuss_strategies:true}, notes: "", snapshot: { metrics: { competency: 48, engagement: 2.9, attendance: 84 }} } } },
            { id: 4, name: "Diana Woo", phase: "Month 3", status: "Withdrawn", metrics: {}, interactionLog: [], phaseData: { "Pre-Onboarding": {checklist:{po_orientation:true}, snapshot:{metrics:{}}}, "Month 1":{checklist:{m1_academic_progress:true}, notes:"Struggled with the daily commute.", snapshot:{metrics:{competency:60, engagement:3.5, attendance:90}}}, "Month 3": {snapshot:{metrics:{competency:50, engagement:3.1, attendance:85}}, checklist:{}, notes:"Decided to withdraw from the program due to personal reasons."} } },
            { id: 5, name: "Emily Hassan", phase: "Pre-Onboarding", status: "Active", metrics: {}, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, notes: "Completed initial setup.", snapshot: { metrics: {} } } } },
            { id: 6, name: "Farhan Ibrahim", phase: "Month 3", status: "Active", metrics: { competency: 68, engagement: 4.0, attendance: 91 }, interactionLog: [{timestamp: "2024-01-10T11:00:00.000Z", text:"Positive follow-up call. Attitude has improved significantly."}], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, notes: "Low engagement and poor initial competency.", snapshot: { metrics: { competency: 45, engagement: 3.2, attendance: 88 } } }, "Month 3": { checklist: { m3_track_attendance:true, m3_assess_attitude:true }, notes: "Showing great improvement after intervention.", snapshot: { metrics: { competency: 68, engagement: 4.0, attendance: 91 } } } } },
            { id: 7, name: "Grace Ong", phase: "Month 1", status: "Active", metrics: { competency: 75, engagement: 4.2, attendance: 97 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_persona: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true, m1_work_performance: true }, snapshot: { metrics: { competency: 75, engagement: 4.2, attendance: 97 } } } } },
            { id: 8, name: "Henry Kumar", phase: "Month 6", status: "Active", metrics: { competency: 62, engagement: 3.7, attendance: 89 }, interactionLog: [{timestamp: "2024-03-05T16:00:00.000Z", text:"Mentor reported a drop in motivation recently."}], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 80, engagement: 4.4, attendance: 98 } } }, "Month 3": { checklist: { m3_track_attendance: true }, snapshot: { metrics: { competency: 75, engagement: 4.0, attendance: 95 } } }, "Month 6": { checklist: { m6_eval_academic: true }, snapshot: { metrics: { competency: 62, engagement: 3.7, attendance: 89 } } } } },
            { id: 9, name: "Isabelle Chan", phase: "Month 6", status: "Active", metrics: { competency: 78, engagement: 4.3, attendance: 94 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: { po_orientation: true, po_goals: true }, snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 70, engagement: 4.0, attendance: 95 } } }, "Month 3": { checklist: { m3_track_attendance: true }, snapshot: { metrics: { competency: 75, engagement: 4.2, attendance: 96 } } }, "Month 6": { checklist: { m6_eval_academic: true }, snapshot: { metrics: { competency: 78, engagement: 4.3, attendance: 94 } } } } },
            { id: 10, name: "Jacky Lee", phase: "Month 1", status: "Active", metrics: { competency: 68, engagement: 3.9, attendance: 93 }, interactionLog: [], phaseData: { "Pre-Onboarding": { checklist: {}, notes: "Joined late, missed orientation.", snapshot: { metrics: {} } }, "Month 1": { checklist: { m1_academic_progress: true }, snapshot: { metrics: { competency: 68, engagement: 3.9, attendance: 93 } } } } }
        ];
    }
    loadData();
    showView('dashboard');
});