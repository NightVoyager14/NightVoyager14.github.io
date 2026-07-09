// ============================================================
//  四川 3+1+2 新高考 · 考试数据
// ============================================================

const GAOKAO_YEAR = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const end = new Date(y, 5, 10, 11, 0, 0);
    return now > end ? y + 1 : y;
})();

// 届数标识（始终显示当前考生所属届）
const COHORT_LABEL = GAOKAO_YEAR + '届';

// 考试配置
const exams = [
    // 6月7日
    { date: 7, start: [9,0],  end: [11,30], name: '语文',         tag: 'mandatory' },
    { date: 7, start: [15,0], end: [17,0],  name: '数学',         tag: 'mandatory' },
    // 6月8日
    { date: 8, start: [9,0],  end: [10,15], name: '历史 / 物理',  tag: 'elective' },
    { date: 8, start: [15,0], end: [17,0],  name: '外语',         tag: 'mandatory' },
    // 6月9日
    { date: 9, start: [8,30], end: [9,45],  name: '化学',         tag: 'elective' },
    { date: 9, start: [11,0], end: [12,15], name: '地理',         tag: 'elective' },
    { date: 9, start: [14,30],end: [15,45], name: '思想政治',     tag: 'elective' },
    { date: 9, start: [17,0], end: [18,15], name: '生物学',       tag: 'elective' },
    // 6月10日
    { date: 10, start: [9,0], end: [11,0],  name: '藏语文 / 彝语文', tag: 'special' },
];

const tagLabels = { mandatory: '全国统考', elective: '等级选考', special: '民族加试' };
const tagClasses = { mandatory: 'tag-mandatory', elective: 'tag-elective', special: 'tag-special' };
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

function getWeekDay(date) {
    const d = new Date(GAOKAO_YEAR, 5, date);
    return '周' + weekDays[d.getDay()];
}

const dateLabels = {};
[7, 8, 9, 10].forEach(d => { dateLabels[d] = `6月${d}日 · ${getWeekDay(d)}`; });

// 为每科生成 Date 对象（预计算，避免每秒重复创建）
const examDates = exams.map(ex => ({
    start: new Date(GAOKAO_YEAR, 5, ex.date, ex.start[0], ex.start[1], 0),
    end:   new Date(GAOKAO_YEAR, 5, ex.date, ex.end[0], ex.end[1], 0),
}));
function getExamStart(e) { return examDates[exams.indexOf(e)].start; }
function getExamEnd(e)   { return examDates[exams.indexOf(e)].end; }

// 预计算高考起止时间
const gaokaoStart = new Date(GAOKAO_YEAR, 5, 7, 0, 0, 0);
const gaokaoEnd   = new Date(GAOKAO_YEAR, 5, 10, 11, 0, 0);

// ============================================================
//  选科标记
// ============================================================

const SUBJECTS = {
    primary: { label: '首选', options: ['历史', '物理'], max: 1 },
    secondary: { label: '再选', options: ['化学', '地理', '思想政治', '生物学'], max: 2 },
};
const allSubjects = [...SUBJECTS.primary.options, ...SUBJECTS.secondary.options];

let selectedSubjects = [];

function loadSubjectSelection() {
    try {
        const saved = localStorage.getItem('gaokao_subjects');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                selectedSubjects = parsed.filter(s => allSubjects.includes(s));
                return;
            }
        }
    } catch (_) {}
    selectedSubjects = [];
}

function saveSubjectSelection() {
    try {
        localStorage.setItem('gaokao_subjects', JSON.stringify(selectedSubjects));
    } catch (_) {}
}

function isSubjectSelected(name) {
    return selectedSubjects.includes(name);
}

function updateSelectorHint() {
    const hint = document.querySelector('.ss-hint');
    if (!hint) return;
    const count = selectedSubjects.length;
    if (count === 0) {
        hint.textContent = '点击标记你的选科';
    } else {
        hint.textContent = `已选 ${count} 科`;
    }
}

function initSubjectSelector() {
    loadSubjectSelection();
    const container = document.getElementById('subjectSelector');
    if (!container) return;

    const options = Array.from(container.querySelectorAll('.ss-option'));
    options.forEach(el => {
        const subject = el.dataset.subject;
        if (isSubjectSelected(subject)) el.classList.add('active');

        el.addEventListener('click', () => {
            const group = SUBJECTS.primary.options.includes(subject) ? 'primary'
                : SUBJECTS.secondary.options.includes(subject) ? 'secondary' : null;
            if (!group) return;

            const isActive = el.classList.contains('active');

            if (group === 'primary') {
                // 首选: 互斥单选
                if (isActive) {
                    el.classList.remove('active');
                    selectedSubjects = selectedSubjects.filter(s => s !== subject);
                } else {
                    // 清除该组所有选中
                    options.forEach(o => {
                        if (SUBJECTS.primary.options.includes(o.dataset.subject)) {
                            o.classList.remove('active');
                        }
                    });
                    el.classList.add('active');
                    selectedSubjects = selectedSubjects.filter(
                        s => !SUBJECTS.primary.options.includes(s)
                    );
                    selectedSubjects.push(subject);
                }
            } else {
                // 再选: 最多选 max 个
                if (isActive) {
                    el.classList.remove('active');
                    selectedSubjects = selectedSubjects.filter(s => s !== subject);
                } else {
                    const currentCount = options.filter(o =>
                        SUBJECTS.secondary.options.includes(o.dataset.subject) &&
                        o.classList.contains('active')
                    ).length;
                    if (currentCount >= SUBJECTS.secondary.max) {
                        // 超过上限时闪烁提示
                        el.style.transition = 'none';
                        el.style.borderColor = '#dc3545';
                        el.style.color = '#dc3545';
                        setTimeout(() => {
                            el.style.transition = '';
                            el.style.borderColor = '';
                            el.style.color = '';
                        }, 300);
                        return;
                    }
                    el.classList.add('active');
                    selectedSubjects.push(subject);
                }
            }

            saveSubjectSelection();
            updateSelectorHint();
            applySubjectHighlight();
        });
    });

    updateSelectorHint();
    applySubjectHighlight();
}

// ============================================================
//  DOM 引用缓存
// ============================================================

const dom = {};
const cardEls = [];
const selCards = [];

// v2.0.0 阶段状态（提前声明，供 updateAll 使用）
let activePhaseId = 'final';
let phaseOverrides = {};

function cacheDom() {
    const ids = [
        'heroSection','heroLabel','statusMsg','yearBadge',
        'hDays','hHours','hMins','hSecs',
        'currentExam','ceLabel','ceBadge','ceName','ceTime',
        'ceCountdown','ceProgressFill','ceProgressStart','ceProgressEnd',
        'fsCurName','fsCurTime','fsProgressFill','fsProgStart','fsProgEnd',
        'fsCurLabel','fsDd','fsDh','fsDm','fsDs',
        'fsNextName','fsNextTime','fsNextCountdown',
        'fsDone','fsRemain','fsTotalHint',
        'fsStatusBar','fsStatusText','fsNext',
    ];
    ids.forEach(id => { dom[id] = document.getElementById(id); });
    dom.fsInner = document.querySelector('.fs-inner');
    dom.fsStatusDot = document.querySelector('.fs-status-dot');
    dom.skeleton = document.getElementById('skeleton');

    exams.forEach(ex => {
        const key = `${ex.date}-${ex.name.replace(/[\/\s]/g,'')}`;
        const card = document.getElementById(`card-${key}`);
        cardEls.push({
            card,
            d: document.getElementById(`cd-d-${key}`),
            h: document.getElementById(`cd-h-${key}`),
            m: document.getElementById(`cd-m-${key}`),
            s: document.getElementById(`cd-s-${key}`),
        });
        selCards.push({
            card,
            nameEl: card?.querySelector('.name'),
            countdownEl: card?.querySelector('.countdown-mini'),
            parts: key.includes('历史') || key.includes('物理')
                ? ['历史', '物理']
                : [ex.name],
            isElective: ex.tag === 'elective',
        });
    });
}

function applySubjectHighlight() {
    selCards.forEach(({ card, nameEl, countdownEl, parts, isElective }) => {
        if (!card || !nameEl) return;
        card.classList.remove('subject-selected', 'subject-dimmed');
        const oldBadge = card.querySelector('.sel-badge');
        if (oldBadge) oldBadge.remove();

        const matched = parts.some(p => isSubjectSelected(p));
        const hasSelection = selectedSubjects.length > 0;

        if (matched) {
            card.classList.add('subject-selected');
            const badge = document.createElement('span');
            badge.className = 'sel-badge';
            badge.textContent = '已选';
            if (countdownEl) countdownEl.before(badge);
        } else if (isElective && hasSelection) {
            card.classList.add('subject-dimmed');
            const badge = document.createElement('span');
            badge.className = 'sel-badge';
            badge.textContent = '未选';
            if (countdownEl) countdownEl.before(badge);
        }
    });
}

// ============================================================
//  渲染
// ============================================================

function pad2(n) { return String(n).padStart(2, '0'); }

function render() {
    const root = document.getElementById('scheduleRoot');
    root.innerHTML = '';

    // 按日期分组
    const groups = {};
    exams.forEach(ex => {
        if (!groups[ex.date]) groups[ex.date] = [];
        groups[ex.date].push(ex);
    });

    Object.keys(groups).sort((a, b) => a - b).forEach(dateKey => {
        const dayExams = groups[dateKey];

        // 日期组容器
        const grp = document.createElement('div');
        grp.className = 'day-group';

        const hdr = document.createElement('div');
        hdr.className = 'day-header';
        hdr.innerHTML = `<span class="day-num">${dateKey}</span><span class="day-date">${dateLabels[dateKey]}</span>`;
        grp.appendChild(hdr);

        // 按上下午分组
        let lastSession = '';
        dayExams.forEach(ex => {
            const isAM = ex.start[0] < 12;
            const session = isAM ? '上午' : '下午';

            if (session !== lastSession) {
                lastSession = session;
                const div = document.createElement('div');
                div.className = 'session-divider';
                div.innerHTML = `<span class="line"></span><span class="label">${session}场</span><span class="line"></span>`;
                grp.appendChild(div);
            }
            const card = document.createElement('div');
            card.className = 'exam-card';
            card.id = `card-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}`;

            const startH = pad2(ex.start[0]), startM = pad2(ex.start[1]);
            const endH = pad2(ex.end[0]), endM = pad2(ex.end[1]);
            const durationMin = (ex.end[0]*60+ex.end[1]) - (ex.start[0]*60+ex.start[1]);
            const durStr = durationMin >= 60
                ? `${Math.floor(durationMin/60)}时${durationMin%60 ? durationMin%60+'分' : ''}`
                : `${durationMin}分钟`;

            card.innerHTML = `
                <span class="name">${ex.name}</span>
                <span class="meta">
                    <span class="time-range">${startH}:${startM} – ${endH}:${endM}</span>
                    <span class="tag ${tagClasses[ex.tag]}">${tagLabels[ex.tag]}</span>
                    <span style="color:#bbb;font-size:0.72rem;">${durStr}</span>
                </span>
                <span class="countdown-mini" id="cd-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}">
                    <span class="cd-num" id="cd-d-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}">--</span><span class="cd-unit">天</span>
                    <span class="cd-sep">·</span>
                    <span class="cd-num" id="cd-h-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}">--</span><span class="cd-unit">时</span>
                    <span class="cd-sep">·</span>
                    <span class="cd-num" id="cd-m-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}">--</span><span class="cd-unit">分</span>
                    <span class="cd-sep">·</span>
                    <span class="cd-num" id="cd-s-${ex.date}-${ex.name.replace(/[\/\s]/g,'')}">--</span><span class="cd-unit">秒</span>
                </span>
            `;

            grp.appendChild(card);
        });

        root.appendChild(grp);
    });

    // 提示标签
    const hint = document.createElement('div');
    hint.className = 'cd-legend';
    hint.textContent = '距开考倒计时';
    root.appendChild(hint);
}

// 渲染页面 + 初始化选科
render();
initSubjectSelector();

// 缓存 DOM（此时卡片已存在）
cacheDom();

// 骨架屏淡出
requestAnimationFrame(() => {
    const sk = dom.skeleton;
    if (sk) {
        sk.style.transition = 'opacity 0.4s ease';
        sk.style.opacity = '0';
        sk.addEventListener('transitionend', () => sk.remove());
    }
});

// ============================================================
//  更新所有倒计时
// ============================================================

let lastTick = 0;
let lastSelectionSnapshot = '';

function updateAll(force) {
    const now = new Date();

    // 非高考阶段：仅更新 hero 和阶段详情
    if (activePhaseId !== 'final') {
        updatePhaseHero();
        updatePhaseDetail();
        return;
    }

    // --- 总体倒计时（高考） ---
    const heroLabel = dom.heroLabel;
    const yearBadge = dom.yearBadge;
    const heroSection = dom.heroSection;
    const statusMsg = dom.statusMsg;

    yearBadge.textContent = COHORT_LABEL;

    if (now >= gaokaoStart && now <= gaokaoEnd) {
        const diff = gaokaoEnd - now;
        setHero(diff, '距全部结束还有');
        heroSection.classList.add('ongoing');
        statusMsg.classList.add('show');
    } else if (now < gaokaoStart) {
        const diff = gaokaoStart - now;
        setHero(diff, `距 ${GAOKAO_YEAR} 年高考还有`);
        heroSection.classList.remove('ongoing');
        statusMsg.classList.remove('show');
    } else {
        const nextStart = new Date(GAOKAO_YEAR + 1, 5, 7, 0, 0, 0);
        const diff = nextStart - now;
        setHero(diff, `距 ${GAOKAO_YEAR + 1} 年高考还有`);
        heroSection.classList.remove('ongoing');
        statusMsg.classList.remove('show');
    }

    // --- 每科倒计时（使用缓存的 DOM） ---
    exams.forEach((ex, i) => {
        const el = cardEls[i];
        if (!el || !el.d) return;
        const { card, d: dEl, h: hEl, m: mEl, s: sEl } = el;
        const start = getExamStart(ex);
        const end   = getExamEnd(ex);

        const wasDone = card.classList.contains('exam-done');
        const wasNow  = card.classList.contains('exam-now');
        card.classList.remove('exam-now', 'exam-done');

        if (now < start) {
            const diff = start - now;
            dEl.textContent = pad2(Math.floor(diff / 86400000));
            hEl.textContent = pad2(Math.floor((diff % 86400000) / 3600000));
            mEl.textContent = pad2(Math.floor((diff % 3600000) / 60000));
            sEl.textContent = pad2(Math.floor((diff % 60000) / 1000));

            if (wasDone) {
                const b = card.querySelector('.exam-done-badge');
                if (b) b.remove();
            }
        } else if (now >= start && now <= end) {
            card.classList.add('exam-now');
            const diff = end - now;
            dEl.textContent = '00';
            hEl.textContent = pad2(Math.floor(diff / 3600000));
            mEl.textContent = pad2(Math.floor((diff % 3600000) / 60000));
            sEl.textContent = pad2(Math.floor((diff % 60000) / 1000));

            if (!wasNow) {
                let badge = card.querySelector('.exam-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'exam-badge';
                    badge.textContent = '考试中';
                    card.querySelector('.name').appendChild(badge);
                }
                const doneBadge = card.querySelector('.exam-done-badge');
                if (doneBadge) doneBadge.remove();
            }
        } else {
            card.classList.add('exam-done');
            dEl.textContent = '';
            hEl.textContent = '';
            mEl.textContent = '';
            sEl.textContent = '';

            if (!wasDone) {
                let doneBadge = card.querySelector('.exam-done-badge');
                if (!doneBadge) {
                    doneBadge = document.createElement('span');
                    doneBadge.className = 'exam-done-badge';
                    doneBadge.textContent = '已完成';
                    card.querySelector('.countdown-mini').appendChild(doneBadge);
                }
                const badge = card.querySelector('.exam-badge');
                if (badge) badge.remove();
            }
        }
    });

    // 选科高亮（仅在选中状态变化时更新）
    const snap = selectedSubjects.sort().join(',');
    if (force || snap !== lastSelectionSnapshot) {
        lastSelectionSnapshot = snap;
        applySubjectHighlight();
    }

    // --- 当前考试进程状态 ---
    const ceEl = dom.currentExam;
    const ceLabel = dom.ceLabel;
    const ceBadge = dom.ceBadge;
    const ceName = dom.ceName;
    const ceTime = dom.ceTime;
    const ceCountdown = dom.ceCountdown;
    const ceFill = dom.ceProgressFill;
    const ceStart = dom.ceProgressStart;
    const ceEnd = dom.ceProgressEnd;

    // 找到当前/下一场/上一场考试（考虑选科）
    let current = null, next = null, lastDone = null;
    for (const ex of exams) {
        if (selectedSubjects.length > 0 && !isExamRelevant(ex)) continue;
        const s = getExamStart(ex);
        const e = getExamEnd(ex);
        if (now >= s && now <= e) { current = ex; break; }
        if (now < s && !next) next = ex;
        if (now > e) lastDone = ex;
    }

    if (current) {
        const s = getExamStart(current);
        const e = getExamEnd(current);
        const total = e - s;
        const elapsed = now - s;
        const remain = e - now;
        const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));

        ceEl.classList.remove('ce-waiting');
        ceEl.classList.add('show');
        const sh = pad2(current.start[0]), sm = pad2(current.start[1]);
        const eh = pad2(current.end[0]), em = pad2(current.end[1]);
        ceLabel.textContent = '当前考试';
        ceBadge.textContent = '进行中';
        ceBadge.className = 'ce-status-badge ce-ongoing';
        ceName.textContent = current.name;
        ceTime.textContent = `${sh}:${sm} ~ ${eh}:${em}`;
        const rh = Math.floor(remain / 3600000);
        const rm = Math.floor((remain % 3600000) / 60000);
        const rs = Math.floor((remain % 60000) / 1000);
        ceCountdown.textContent = `${pad2(rh)}:${pad2(rm)}:${pad2(rs)}`;
        ceFill.style.width = `${pct}%`;
        ceStart.textContent = '开始';
        ceEnd.textContent = '剩余 ' + ceCountdown.textContent;
    } else if (next) {
        const s = getExamStart(next);
        const diff = s - now;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s_ = Math.floor((diff % 60000) / 1000);

        ceEl.classList.add('show');
        const sh = pad2(next.start[0]), sm = pad2(next.start[1]);
        const eh = pad2(next.end[0]), em = pad2(next.end[1]);
        ceLabel.textContent = '下一场';
        ceBadge.textContent = '即将开始';
        ceBadge.className = 'ce-status-badge ce-upcoming';
        ceName.textContent = next.name;
        ceTime.textContent = `${sh}:${sm} ~ ${eh}:${em}`;
        ceCountdown.textContent = d > 0
            ? `${d}天 ${pad2(h)}:${pad2(m)}:${pad2(s_)}`
            : `${pad2(h)}:${pad2(m)}:${pad2(s_)}`;
        ceFill.style.width = '0%';
        ceStart.textContent = '距离开考';
        ceEnd.textContent = ceCountdown.textContent;
        ceEl.classList.add('ce-waiting');
    } else if (lastDone) {
        ceEl.classList.add('show');
        ceLabel.textContent = '高考进程';
        ceBadge.textContent = '已全部完成';
        ceBadge.className = 'ce-status-badge ce-done';
        ceName.textContent = '所有考试已结束';
        ceTime.textContent = '—';
        ceCountdown.textContent = '—';
        ceFill.style.width = '100%';
        ceStart.textContent = '全部完成';
        ceEnd.textContent = '金榜题名';
        ceEl.classList.remove('ce-waiting');
    } else {
        ceEl.classList.remove('show', 'ce-waiting');
    }
}

function setHero(diff, label) {
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    dom.hDays.textContent   = pad2(d);
    dom.hHours.textContent  = pad2(h);
    dom.hMins.textContent   = pad2(m);
    dom.hSecs.textContent   = pad2(s);
    heroLabel.textContent   = label;
}

// 首次渲染
updateAll(true);

// 使用 requestAnimationFrame 驱动更新，每秒最多执行一次
function tickLoop(time) {
    if (time - lastTick >= 1000) {
        lastTick = time;
        updateAll();
    }
    requestAnimationFrame(tickLoop);
}
requestAnimationFrame(tickLoop);

// ============================================================
//  主题切换
// ============================================================

const themeToggle = document.getElementById('themeToggle');

function loadTheme() {
    try {
        const saved = localStorage.getItem('gaokao_theme');
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.textContent = '深色';
            return;
        }
    } catch (_) {}
    document.documentElement.removeAttribute('data-theme');
    themeToggle.textContent = '浅色';
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '浅色';
        try { localStorage.setItem('gaokao_theme', 'light'); } catch (_) {}
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '深色';
        try { localStorage.setItem('gaokao_theme', 'dark'); } catch (_) {}
    }
    if (fsOverlay.classList.contains('open')) updateFullscreen();
}

themeToggle.addEventListener('click', toggleTheme);
loadTheme();

// ============================================================
//  PWA 安装提示
// ============================================================

let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = '';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
        installBtn.style.display = 'none';
    }
    deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
    installBtn.style.display = 'none';
    deferredPrompt = null;
});

// ============================================================
//  浮动小窗 (Picture-in-Picture)
// ============================================================

const pipBtn = document.getElementById('pipToggle');
let pipWindow = null;
let pipInterval = null;

function buildPipContent(doc, winW, winH) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bg = isDark ? '#1c1814' : '#f8f4ee';
    const cardBg = isDark ? '#2a2420' : '#ffffff';
    const textMain = isDark ? '#e8e0d8' : '#3a3228';
    const textSec = isDark ? '#a09088' : '#a09080';
    const accent = isDark ? '#d4a880' : '#c8946a';
    const border = isDark ? '#3a342e' : '#e8e0d8';

    const baseSize = Math.max(8, Math.min(winW, winH * 1.8) / 22);

    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: ${bg};
    color: ${textMain};
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: ${baseSize * 0.4}px;
    user-select: none;
}
.pip-label {
    font-size: ${baseSize * 0.7}px;
    color: ${textSec};
    letter-spacing: 2px;
    margin-bottom: ${baseSize * 0.3}px;
    flex-shrink: 0;
    text-align: center;
    white-space: nowrap;
}
.pip-digits {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: ${baseSize * 0.12}px;
    font-variant-numeric: tabular-nums;
    width: 100%;
    flex-shrink: 0;
}
.pip-digits .block { flex: 1; text-align: center; min-width: 0; }
.pip-digits .block .num {
    font-size: ${baseSize * 1.6}px;
    font-weight: 700;
    color: ${accent};
    line-height: 1.15;
}
.pip-digits .block .unit {
    font-size: ${baseSize * 0.5}px;
    color: ${textSec};
    margin-top: ${baseSize * 0.08}px;
}
.pip-digits .sep {
    font-size: ${baseSize * 1.2}px;
    font-weight: 300;
    color: ${textSec};
    flex-shrink: 0;
    width: ${baseSize * 0.3}px;
    text-align: center;
    padding-bottom: ${baseSize * 0.45}px;
}
.pip-next {
    margin-top: ${baseSize * 0.5}px;
    padding: ${baseSize * 0.3}px ${baseSize * 0.6}px;
    background: ${cardBg};
    border-radius: ${baseSize * 0.4}px;
    border: 1px solid ${border};
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    max-width: ${Math.min(winW - baseSize * 0.8, 340)}px;
    flex-shrink: 0;
    font-size: ${baseSize * 0.7}px;
}
.pip-next .label { color: ${textSec}; white-space: nowrap; }
.pip-next .name { color: ${textMain}; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 ${baseSize * 0.25}px; flex: 1; }
.pip-next .time { color: ${accent}; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
</head>
<body>
    <div class="pip-label" id="pipLabel">距 2027 年高考还有</div>
    <div class="pip-digits">
        <div class="block"><div class="num" id="pipD">344</div><div class="unit">天</div></div>
        <span class="sep">:</span>
        <div class="block"><div class="num" id="pipH">23</div><div class="unit">时</div></div>
        <span class="sep">:</span>
        <div class="block"><div class="num" id="pipM">59</div><div class="unit">分</div></div>
        <span class="sep">:</span>
        <div class="block"><div class="num" id="pipS">58</div><div class="unit">秒</div></div>
    </div>
    <div class="pip-next">
        <span class="label">下一场</span>
        <span class="name" id="pipNext">语文</span>
        <span class="time" id="pipNextTime">344天</span>
    </div>
</body>
</html>`);
    doc.close();
}

function updatePipContent() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const now = new Date();

    const gaokaoStart = new Date(GAOKAO_YEAR, 5, 7, 0, 0, 0);
    const gaokaoEnd = new Date(GAOKAO_YEAR, 5, 10, 11, 0, 0);
    let diff, label;
    if (now >= gaokaoStart && now <= gaokaoEnd) {
        diff = gaokaoEnd - now;
        label = '距全部结束还有';
    } else if (now < gaokaoStart) {
        diff = gaokaoStart - now;
        label = `距 ${GAOKAO_YEAR} 年高考还有`;
    } else {
        const nextStart = new Date(GAOKAO_YEAR + 1, 5, 7, 0, 0, 0);
        diff = nextStart - now;
        label = `距 ${GAOKAO_YEAR + 1} 年高考还有`;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const elLabel = doc.getElementById('pipLabel');
    const elD = doc.getElementById('pipD');
    const elH = doc.getElementById('pipH');
    const elM = doc.getElementById('pipM');
    const elS = doc.getElementById('pipS');
    if (elLabel) elLabel.textContent = label;
    if (elD) elD.textContent = pad2(d);
    if (elH) elH.textContent = pad2(h);
    if (elM) elM.textContent = pad2(m);
    if (elS) elS.textContent = pad2(s);

    let nextName = '—', nextTime = '—';
    for (const ex of exams) {
        if (selectedSubjects.length > 0 && !isExamRelevant(ex)) continue;
        const s = getExamStart(ex);
        if (now < s) {
            nextName = ex.name;
            const diff2 = s - now;
            const d2 = Math.floor(diff2 / 86400000);
            const h2 = Math.floor((diff2 % 86400000) / 3600000);
            const m2 = Math.floor((diff2 % 3600000) / 60000);
            nextTime = d2 > 0 ? `${d2}天` : `${pad2(h2)}:${pad2(m2)}`;
            break;
        }
    }
    const elNext = doc.getElementById('pipNext');
    const elNextTime = doc.getElementById('pipNextTime');
    if (elNext) elNext.textContent = nextName;
    if (elNextTime) elNextTime.textContent = nextTime;
}

pipBtn.addEventListener('click', async () => {
    if (pipWindow && !pipWindow.closed) {
        pipWindow.close();
        clearInterval(pipInterval);
        pipWindow = null;
        pipInterval = null;
        pipBtn.textContent = '小窗';
        return;
    }
    if (!('documentPictureInPicture' in window)) {
        pipBtn.textContent = '不支持';
        setTimeout(() => { pipBtn.textContent = '小窗'; }, 1500);
        return;
    }
    try {
        const pipW = 360, pipH = 210;
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: pipW,
            height: pipH,
        });
        pipBtn.textContent = '关闭';
        pipWindow.document.title = '高考倒计时';
        buildPipContent(pipWindow.document, pipW, pipH);
        updatePipContent();
        pipInterval = setInterval(updatePipContent, 1000);

        pipWindow.addEventListener('pagehide', () => {
            clearInterval(pipInterval);
            pipWindow = null;
            pipInterval = null;
            pipBtn.textContent = '小窗';
        });
    } catch (e) {
        // 用户取消或出错
    }
});

// ============================================================
//  全屏模式
// ============================================================

const fsOverlay = document.getElementById('fsOverlay');
const fsToggle  = document.getElementById('fsToggle');
const fsExit    = document.getElementById('fsExit');

function isExamRelevant(ex) {
    if (selectedSubjects.length === 0) return true;
    if (ex.tag !== 'elective') return true;
    const parts = ex.name.split('/').map(s => s.trim());
    return parts.some(p => selectedSubjects.includes(p));
}

function updateFullscreen() {
    const now = new Date();
    const fsInner = document.querySelector('.fs-inner');

    if (activePhaseId !== 'final') {
        const cfg = PHASE_CONFIG[activePhaseId];
        const { start, end } = getPhaseDates(activePhaseId);
        const status = getPhaseStatus(activePhaseId);

        document.getElementById('fsStatusBar').style.display = 'none';
        document.getElementById('fsNext').style.display = 'none';
        document.getElementById('fsSummary').style.display = 'none';
        document.getElementById('fsProgressFill').parentElement.parentElement.style.display = 'none';
        document.getElementById('fsCurTime').style.display = 'none';

        document.getElementById('fsCurLabel').textContent = cfg.name;
        document.getElementById('fsCurName').textContent = status === 'upcoming' ? '即将开始'
            : status === 'ongoing' ? '进行中' : '已完成';

        const fmtOpt = { year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('fsCurTime').textContent =
            `${start.toLocaleDateString('zh-CN', fmtOpt)} - ${end.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`;

        const fsDd = document.getElementById('fsDd');
        const fsDh = document.getElementById('fsDh');
        const fsDm = document.getElementById('fsDm');
        const fsDs = document.getElementById('fsDs');

        let diff;
        if (now < start) diff = start - now;
        else if (now <= end) diff = end - now;
        else diff = 0;

        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        fsDd.textContent = pad2(d);
        fsDh.textContent = pad2(h);
        fsDm.textContent = pad2(m);
        fsDs.textContent = pad2(s);
        return;
    }

    // 恢复显示高考专有元素
    document.getElementById('fsStatusBar').style.display = '';
    document.getElementById('fsNext').style.display = '';
    document.getElementById('fsSummary').style.display = '';
    document.getElementById('fsProgressFill').parentElement.parentElement.style.display = '';
    document.getElementById('fsCurTime').style.display = '';

    let hasCurrent = false, curExam = null;
    for (const ex of exams) {
        if (!isExamRelevant(ex)) continue;
        const s = getExamStart(ex), e = getExamEnd(ex);
        if (now >= s && now <= e) { hasCurrent = true; curExam = ex; break; }
    }

    const allDone = exams.every(ex => now > getExamEnd(ex));
    fsInner.classList.toggle('fs-state-waiting', !hasCurrent && !allDone);

    const fsStatusBar = document.getElementById('fsStatusBar');
    const fsStatusText = document.getElementById('fsStatusText');
    fsStatusBar.className = 'fs-status-bar';
    if (hasCurrent) {
        fsStatusBar.classList.add('status-ongoing');
        fsStatusText.textContent = '正在进行';
    } else if (allDone) {
        fsStatusBar.classList.add('status-done');
        fsStatusText.textContent = '已全部完成';
    } else {
        fsStatusBar.classList.add('status-waiting');
        fsStatusText.textContent = '等待开考';
    }

    const ceEl = document.getElementById('currentExam');
    const isVisible = ceEl.classList.contains('show');
    const curName  = document.getElementById('ceName').textContent;
    const curTime  = document.getElementById('ceTime').textContent;
    const progFill = document.getElementById('ceProgressFill').style.width || '0%';
    const progEnd  = document.getElementById('ceProgressEnd').textContent;

    document.getElementById('fsCurName').textContent  = curName !== '—' ? curName : '暂无考试';
    document.getElementById('fsCurTime').textContent  = curTime;
    document.getElementById('fsProgressFill').style.width = progFill;
    document.getElementById('fsProgEnd').textContent  = progEnd;

    document.getElementById('fsCurLabel').textContent =
        hasCurrent ? '当前考试' : (isVisible ? '下一场' : '高考进程');

    const fsDd = document.getElementById('fsDd');
    const fsDh = document.getElementById('fsDh');
    const fsDm = document.getElementById('fsDm');
    const fsDs = document.getElementById('fsDs');

    let targetEnd = null;
    for (const ex of exams) {
        if (!isExamRelevant(ex)) continue;
        const s = getExamStart(ex), e = getExamEnd(ex);
        if (now >= s && now <= e) { targetEnd = e; break; }
        if (now < s && !targetEnd) { targetEnd = s; break; }
    }
    if (targetEnd) {
        const diff = Math.max(0, targetEnd - now);
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        fsDd.textContent = pad2(d);
        fsDh.textContent = pad2(h);
        fsDm.textContent = pad2(m);
        fsDs.textContent = pad2(s);
    } else {
        fsDd.textContent = '—'; fsDh.textContent = '—';
        fsDm.textContent = '—'; fsDs.textContent = '—';
    }

    let nextName = '—', nextTime = '—', nextCountdown = '—';
    for (const ex of exams) {
        if (!isExamRelevant(ex)) continue;
        const s = getExamStart(ex);
        if (now < s) {
            nextName = ex.name;
            const sh = pad2(ex.start[0]), sm = pad2(ex.start[1]);
            const eh = pad2(ex.end[0]), em = pad2(ex.end[1]);
            nextTime = `${sh}:${sm} ~ ${eh}:${em}`;
            const diff = s - now;
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s_ = Math.floor((diff % 60000) / 1000);
            nextCountdown = d > 0
                ? `${d}天 ${pad2(h)}:${pad2(m)}:${pad2(s_)}`
                : `${pad2(h)}:${pad2(m)}:${pad2(s_)}`;
            break;
        }
    }

    if (allDone) {
        document.getElementById('fsNext').style.display = 'none';
    } else {
        document.getElementById('fsNext').style.display = 'flex';
        document.getElementById('fsNextName').textContent      = nextName;
        document.getElementById('fsNextTime').textContent      = nextTime;
        document.getElementById('fsNextCountdown').textContent = nextCountdown;
    }

    const relevantExams = exams.filter(ex => isExamRelevant(ex));
    let doneCount = 0;
    relevantExams.forEach(ex => { if (now > getExamEnd(ex)) doneCount++; });
    document.getElementById('fsDone').textContent   = doneCount;
    document.getElementById('fsRemain').textContent = relevantExams.length - doneCount;
    const fsHint = document.getElementById('fsTotalHint');
    if (fsHint) {
        fsHint.textContent = selectedSubjects.length > 0
            ? '· 已选科'
            : '· 全部科目';
    }
}

function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
}

fsToggle.addEventListener('click', () => {
    fsOverlay.classList.add('open');
    lockScroll(true);
    updateFullscreen();
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
});

fsExit.addEventListener('click', () => {
    fsOverlay.classList.remove('open');
    lockScroll(false);
    if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        fsOverlay.classList.remove('open');
        lockScroll(false);
    }
});

// 全屏时也同步更新
setInterval(() => {
    if (fsOverlay.classList.contains('open')) updateFullscreen();
}, 1000);

// ============================================================
//  v2.0.0 - 诊断考试阶段管理
// ============================================================

const PHASE_CONFIG = {
    zero: {
        id: 'zero', name: '零诊', longName: '零诊 · 摸底考试', short: '零',
        defaultStart: { year: 2026, month: 7, day: 6 },
        defaultEnd: { year: 2026, month: 7, day: 8 },
        desc: '高三摸底考试',
    },
    first: {
        id: 'first', name: '一诊', longName: '第一次诊断性考试', short: '一',
        defaultStart: { year: 2026, month: 12, day: 22 },
        defaultEnd: { year: 2026, month: 12, day: 24 },
        desc: '第一次诊断性考试',
    },
    second: {
        id: 'second', name: '二诊', longName: '第二次诊断性考试', short: '二',
        defaultStart: { year: 2027, month: 3, day: 23 },
        defaultEnd: { year: 2027, month: 3, day: 25 },
        desc: '第二次诊断性考试',
    },
    third: {
        id: 'third', name: '三诊', longName: '第三次诊断性考试', short: '三',
        defaultStart: { year: 2027, month: 4, day: 27 },
        defaultEnd: { year: 2027, month: 4, day: 29 },
        desc: '第三次诊断性考试',
    },
    final: {
        id: 'final', name: '高考', longName: '全国统一高考', short: '终',
        defaultStart: { year: 2027, month: 6, day: 7 },
        defaultEnd: { year: 2027, month: 6, day: 10 },
        desc: '全国统一高考',
    },
};

const PHASE_ORDER = ['zero', 'first', 'second', 'third', 'final'];

function loadPhaseSettings() {
    try {
        const saved = localStorage.getItem('gaokao_phase_settings');
        if (saved) phaseOverrides = JSON.parse(saved);
    } catch (_) {}
}

function savePhaseSettings() {
    try {
        localStorage.setItem('gaokao_phase_settings', JSON.stringify(phaseOverrides));
    } catch (_) {}
}

function getPhaseDates(phaseId) {
    const cfg = PHASE_CONFIG[phaseId];
    const ov = phaseOverrides[phaseId];
    if (ov) {
        return {
            start: new Date(ov.startYear, ov.startMonth - 1, ov.startDay),
            end: new Date(ov.endYear, ov.endMonth - 1, ov.endDay),
        };
    }
    return {
        start: new Date(cfg.defaultStart.year, cfg.defaultStart.month - 1, cfg.defaultStart.day),
        end: new Date(cfg.defaultEnd.year, cfg.defaultEnd.month - 1, cfg.defaultEnd.day),
    };
}

function getPhaseStatus(phaseId) {
    const now = new Date();
    const { start, end } = getPhaseDates(phaseId);
    if (now < start) return 'upcoming';
    if (now > end) return 'done';
    return 'ongoing';
}

// ---- 阶段导航 ----
function initPhaseNav() {
    const nav = document.getElementById('phaseNav');
    if (!nav) return;
    PHASE_ORDER.forEach(id => {
        const cfg = PHASE_CONFIG[id];
        const status = getPhaseStatus(id);
        const tab = document.createElement('button');
        tab.className = `phase-tab${status === 'done' ? ' done' : ''}${id === activePhaseId ? ' active' : ''}`;
        tab.dataset.phase = id;
        tab.innerHTML = `
            <span>${cfg.name}</span>
            <span class="pt-sub">${status === 'done' ? '已结束' : status === 'ongoing' ? '进行中' : cfg.short}</span>
            ${status === 'done' ? '<span class="pt-badge">✓</span>' : ''}
        `;
        tab.addEventListener('click', () => switchPhase(id));
        nav.appendChild(tab);
    });
}

function switchPhase(phaseId) {
    if (phaseId === activePhaseId && phaseId !== 'final') return;
    activePhaseId = phaseId;

    document.querySelectorAll('.phase-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.phase === phaseId);
    });

    const isFinal = phaseId === 'final';
    document.getElementById('gaokaoContent').classList.toggle('hidden', !isFinal);
    document.getElementById('phaseDetail').classList.toggle('show', !isFinal);

    updatePhaseHero();
    if (!isFinal) updatePhaseDetail();
    if (fsOverlay.classList.contains('open')) updateFullscreen();
}

function updatePhaseHero() {
    const now = new Date();
    const cfg = PHASE_CONFIG[activePhaseId];
    const { start, end } = getPhaseDates(activePhaseId);

    dom.yearBadge.textContent = COHORT_LABEL;

    if (now < start) {
        setHero(start - now, `距 ${cfg.name} 还有`);
        dom.heroSection.classList.remove('ongoing');
        dom.statusMsg.classList.remove('show');
    } else if (now <= end) {
        setHero(end - now, `距 ${cfg.name} 结束还有`);
        dom.heroSection.classList.add('ongoing');
        dom.statusMsg.classList.remove('show');
    } else {
        const nextPhase = PHASE_ORDER.find(id => getPhaseDates(id).start > now);
        if (nextPhase) {
            setHero(getPhaseDates(nextPhase).start - now, `距 ${PHASE_CONFIG[nextPhase].name} 还有`);
        } else {
            setHero(0, '所有考试已结束 · 金榜题名');
        }
        dom.heroSection.classList.remove('ongoing');
        dom.statusMsg.classList.remove('show');
    }
}

function updatePhaseDetail() {
    const detail = document.getElementById('phaseDetail');
    if (!detail.classList.contains('show')) return;

    const cfg = PHASE_CONFIG[activePhaseId];
    const { start, end } = getPhaseDates(activePhaseId);
    const status = getPhaseStatus(activePhaseId);
    const now = new Date();

    document.getElementById('pdName').textContent = cfg.longName || cfg.name;

    const fmtOpt = { year: 'numeric', month: 'long', day: 'numeric' };
    const startStr = start.toLocaleDateString('zh-CN', fmtOpt);
    const endStr = end.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    document.getElementById('pdDateRange').textContent = `${startStr} - ${endStr}`;

    const badge = document.getElementById('pdBadge');
    badge.className = 'pd-status-badge';
    if (status === 'upcoming') {
        badge.classList.add('upcoming');
        badge.textContent = '即将开始';
    } else if (status === 'ongoing') {
        badge.classList.add('ongoing');
        badge.textContent = '进行中';
    } else {
        badge.classList.add('done');
        badge.textContent = '已完成';
    }

    let diff, label;
    if (now < start) { diff = start - now; label = '距开考还有'; }
    else if (now <= end) { diff = end - now; label = '距结束还有'; }
    else { diff = 0; label = '已结束'; }

    document.getElementById('pdDays').textContent = pad2(Math.floor(diff / 86400000));
    document.getElementById('pdHours').textContent = pad2(Math.floor((diff % 86400000) / 3600000));
    document.getElementById('pdMins').textContent = pad2(Math.floor((diff % 3600000) / 60000));
    document.getElementById('pdSecs').textContent = pad2(Math.floor((diff % 60000) / 1000));
    document.getElementById('pdDesc').textContent = label;

    const pdTimer = detail.querySelector('.pd-timer');
    pdTimer.style.animation = status === 'ongoing' ? 'pulseSoft 1.5s ease-in-out infinite' : '';
}

// ---- 自定义日历选择器 ----
let calState = null;

function openCalendar(trigger) {
    closeCalendar();
    const year = parseInt(trigger.dataset.year);
    const month = parseInt(trigger.dataset.month);
    calState = { trigger, year, month };
    trigger.classList.add('active');
    renderCalendar(year, month);
    positionCalendar(trigger);
    document.getElementById('calPopup').classList.add('open');
}

function closeCalendar() {
    if (calState) {
        calState.trigger.classList.remove('active');
        calState = null;
    }
    document.getElementById('calPopup').classList.remove('open');
}

function positionCalendar(trigger) {
    const rect = trigger.getBoundingClientRect();
    const popup = document.getElementById('calPopup');
    let top = rect.bottom + 6;
    let left = rect.left;

    if (left + 272 > window.innerWidth) {
        left = window.innerWidth - 272;
    }
    if (top + 300 > window.innerHeight) {
        top = rect.top - 300;
    }
    popup.style.top = Math.max(4, top) + 'px';
    popup.style.left = Math.max(4, left) + 'px';
}

function renderCalendar(year, month) {
    document.getElementById('calTitle').textContent = `${year}年 ${month}月`;
    const daysContainer = document.getElementById('calDays');
    daysContainer.innerHTML = '';

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const prevLastDay = new Date(year, month - 1, 0);

    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const totalDays = lastDay.getDate();
    const prevTotal = prevLastDay.getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;

    const selYear = calState ? parseInt(calState.trigger.dataset.year) : year;
    const selMonth = calState ? parseInt(calState.trigger.dataset.month) : month;
    const selDay = calState ? parseInt(calState.trigger.dataset.day) : 1;
    const selStr = `${selYear}-${selMonth}-${selDay}`;

    const cells = [];

    for (let i = startOffset - 1; i >= 0; i--) {
        cells.push({ day: prevTotal - i, other: true });
    }
    for (let d = 1; d <= totalDays; d++) {
        cells.push({ day: d, other: false });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, other: true });
    }

    cells.forEach(cell => {
        const btn = document.createElement('button');
        btn.className = 'cal-day';
        btn.textContent = cell.day;
        if (cell.other) btn.classList.add('other-month');

        const dStr = `${year}-${month}-${cell.day}`;
        if (dStr === todayStr) btn.classList.add('today');
        if (!cell.other && dStr === selStr) btn.classList.add('selected');

        btn.addEventListener('click', () => selectDay(cell.day));
        daysContainer.appendChild(btn);
    });
}

function selectDay(day) {
    if (!calState) return;
    const { trigger, year, month } = calState;
    trigger.dataset.year = year;
    trigger.dataset.month = month;
    trigger.dataset.day = day;
    trigger.querySelector('.dp-value').textContent = `${year}年${month}月${day}日`;
    closeCalendar();
}

function goMonth(delta) {
    if (!calState) return;
    let newMonth = calState.month + delta;
    let newYear = calState.year;
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    else if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    calState.year = newYear;
    calState.month = newMonth;
    renderCalendar(calState.year, calState.month);
    positionCalendar(calState.trigger);
}

function initCalendar() {
    document.getElementById('calPrev').addEventListener('click', () => goMonth(-1));
    document.getElementById('calNext').addEventListener('click', () => goMonth(1));

    document.getElementById('settingsForm').addEventListener('click', (e) => {
        const trigger = e.target.closest('.dp-trigger');
        if (trigger) {
            e.stopPropagation();
            if (calState && calState.trigger === trigger) {
                closeCalendar();
            } else {
                openCalendar(trigger);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!calState) return;
        const popup = document.getElementById('calPopup');
        if (!popup.contains(e.target) && !calState.trigger.contains(e.target)) {
            closeCalendar();
        }
    });

    window.addEventListener('resize', () => {
        if (calState) positionCalendar(calState.trigger);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCalendar();
    });
}

function renderSettingsForm() {
    const form = document.getElementById('settingsForm');
    form.innerHTML = '';

    PHASE_ORDER.forEach(id => {
        const cfg = PHASE_CONFIG[id];
        const ov = phaseOverrides[id];
        const sy = ov ? ov.startYear : cfg.defaultStart.year;
        const sm = ov ? ov.startMonth : cfg.defaultStart.month;
        const sd = ov ? ov.startDay : cfg.defaultStart.day;
        const ey = ov ? ov.endYear : cfg.defaultEnd.year;
        const em = ov ? ov.endMonth : cfg.defaultEnd.month;
        const ed = ov ? ov.endDay : cfg.defaultEnd.day;

        const fmt = (y, m, d) => `${y}年${m}月${d}日`;

        const div = document.createElement('div');
        div.className = 'sm-phase';
        div.innerHTML = `
            <div class="sm-phase-name">${cfg.name}</div>
            <div class="sm-date-row" style="margin-bottom:6px;">
                <div class="dp-trigger" data-phase="${id}" data-type="start"
                     data-year="${sy}" data-month="${sm}" data-day="${sd}" tabindex="0">
                    <span class="dp-label">开始</span>
                    <span class="dp-value">${fmt(sy, sm, sd)}</span>
                    <span class="dp-arrow">▾</span>
                </div>
            </div>
            <div class="sm-date-row">
                <div class="dp-trigger" data-phase="${id}" data-type="end"
                     data-year="${ey}" data-month="${em}" data-day="${ed}" tabindex="0">
                    <span class="dp-label">结束</span>
                    <span class="dp-value">${fmt(ey, em, ed)}</span>
                    <span class="dp-arrow">▾</span>
                </div>
            </div>
        `;
        form.appendChild(div);
    });

    const resetDiv = document.createElement('div');
    resetDiv.style.cssText = 'text-align:center;margin-top:14px;';
    resetDiv.innerHTML = '<button class="sm-reset-btn" id="settingsReset">↻ 恢复默认</button>';
    form.appendChild(resetDiv);
}

function openSettings() {
    renderSettingsForm();
    document.getElementById('settingsModal').classList.add('open');
    lockScroll(true);
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('open');
    lockScroll(false);
}

function saveSettings() {
    const newOverrides = {};
    document.querySelectorAll('.dp-trigger[data-type="start"]').forEach(el => {
        const pid = el.dataset.phase;
        const endEl = document.querySelector(`.dp-trigger[data-type="end"][data-phase="${pid}"]`);
        if (!newOverrides[pid]) newOverrides[pid] = {};
        newOverrides[pid] = {
            startYear: parseInt(el.dataset.year), startMonth: parseInt(el.dataset.month), startDay: parseInt(el.dataset.day),
            endYear: parseInt(endEl.dataset.year), endMonth: parseInt(endEl.dataset.month), endDay: parseInt(endEl.dataset.day),
        };
    });
    phaseOverrides = newOverrides;
    savePhaseSettings();
    closeSettings();
    refreshPhaseUI();
}

function refreshPhaseUI() {
    document.getElementById('phaseNav').innerHTML = '';
    initPhaseNav();
    switchPhase(activePhaseId);
    updateAll(true);
}

function resetSettings() {
    phaseOverrides = {};
    savePhaseSettings();
    renderSettingsForm();
}

// ---- 绑定设置事件 ----
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsCancel').addEventListener('click', closeSettings);
document.getElementById('settingsSave').addEventListener('click', saveSettings);
document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
});
document.getElementById('settingsForm').addEventListener('click', (e) => {
    if (e.target.id === 'settingsReset') resetSettings();
});

// ---- v2.0.0 初始化 ----
loadPhaseSettings();
initPhaseNav();
initCalendar();
switchPhase('final');
updatePhaseHero();

// ---- Service Worker 注册 ----
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}
