// ============================================================
//  四川 3+1+2 新高考 · 页面逻辑
//  ------------------------------------------------------------
//  常量、时间计算与纯函数都在 time.js；本文件负责 DOM 渲染与交互。
// ============================================================

/** 取北京时间下的「日」序号（自 1970-01-01 起的天数），用于跨时区安全的整日推算 */
function cnDayNumber(date) {
    const t = new Date(date.getTime() + CN_OFFSET_MIN * 60000);
    return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) / MS_DAY);
}

/** 按北京时间日历天整日平移（规避夏令时/时区问题） */
function addDays(date, days) {
    const t = new Date(date.getTime() + CN_OFFSET_MIN * 60000);
    const shifted = new Date(Date.UTC(
        t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + days,
        t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()
    ));
    return new Date(shifted.getTime() - CN_OFFSET_MIN * 60000);
}

// 考试 Date 对象按「当前生效的高考日期」推导。
// 用户在设置里改过高考起止后，科目时间会跟随高考起始日整体平移，
// 保证 Hero 倒计时、科目卡片、全屏、小窗四处永远一致。
function computeExamDates() {
    const { start: gkStart } = getPhaseDates('final');
    const dayOffset = cnDayNumber(gkStart) - cnDayNumber(bjDate(GAOKAO_YEAR, 6, 7));
    return exams.map(ex => ({
        start: addDays(examStartAt(ex, GAOKAO_YEAR), dayOffset),
        end: addDays(examEndAt(ex, GAOKAO_YEAR), dayOffset),
    }));
}

let examDates = [];
function getExamStart(e) { return examDates[exams.indexOf(e)].start; }
function getExamEnd(e)   { return examDates[exams.indexOf(e)].end; }

/** 高考总进程的起点：当前生效的高考开始日 */
function getGaokaoStart() { return getPhaseDates('final').start; }

/** 高考总进程的终点：最后一场考试结束 与 用户设定结束日 中较晚者 */
function getGaokaoEnd() {
    const lastEnd = examDates[examDates.length - 1].end;
    const { end } = getPhaseDates('final');
    return end > lastEnd ? end : lastEnd;
}

// ============================================================
//  选科标记
// ============================================================

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

/** 事件目标可能落在按钮内的文本节点上，统一取回按钮本身 */
function closestSubjectOption(node) {
    if (!node) return null;
    return node.closest ? node.closest('.ss-option') : null;
}

/** 同步 .active 类与 aria-pressed，保证视觉与语义一致 */
function setSubjectActive(el, active) {
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
    if (active) el.setAttribute('data-active', '');
    else el.removeAttribute('data-active');
}

function initSubjectSelector() {
    loadSubjectSelection();
    const container = document.getElementById('subjectSelector');
    if (!container) return;

    const options = Array.from(container.querySelectorAll('.ss-option'));
    // 初始状态：同步 aria-pressed（HTML 里默认 false）
    options.forEach(el => {
        setSubjectActive(el, isSubjectSelected(el.dataset.subject));
    });

    container.addEventListener('click', (e) => {
        const el = closestSubjectOption(e.target);
        if (!el || !container.contains(el)) return;
        toggleSubject(el);
    });

    // <button> 原生支持 Enter/Space，无需额外键盘处理
    function toggleSubject(el) {
        const subject = el.dataset.subject;
        const group = SUBJECTS.primary.options.includes(subject) ? 'primary'
            : SUBJECTS.secondary.options.includes(subject) ? 'secondary' : null;
        if (!group) return;

        const isActive = el.classList.contains('active');

        if (group === 'primary') {
            // 首选：互斥单选
            if (isActive) {
                setSubjectActive(el, false);
                selectedSubjects = selectedSubjects.filter(s => s !== subject);
            } else {
                // 清除该组所有选中
                options.forEach(o => {
                    if (SUBJECTS.primary.options.includes(o.dataset.subject)) {
                        setSubjectActive(o, false);
                    }
                });
                setSubjectActive(el, true);
                selectedSubjects = selectedSubjects.filter(
                    s => !SUBJECTS.primary.options.includes(s)
                );
                selectedSubjects.push(subject);
            }
        } else {
            // 再选：最多选 max 个
            if (isActive) {
                setSubjectActive(el, false);
                selectedSubjects = selectedSubjects.filter(s => s !== subject);
            } else {
                const currentCount = options.filter(o =>
                    SUBJECTS.secondary.options.includes(o.dataset.subject) &&
                    o.classList.contains('active')
                ).length;
                if (currentCount >= SUBJECTS.secondary.max) {
                    // 超过上限：抖动提示（颜色走 CSS 变量，深浅主题一致）
                    el.classList.add('ss-reject');
                    setTimeout(() => el.classList.remove('ss-reject'), 320);
                    return;
                }
                setSubjectActive(el, true);
                selectedSubjects.push(subject);
            }
        }

        saveSubjectSelection();
        updateSelectorHint();
        applySubjectHighlight();
    }

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
        'heroSection','heroLabel','statusMsg','yearBadge','heroA11y',
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
            // 带上状态类：徽章样式不必再依赖祖先选择器去猜是「已选」还是「未选」
            badge.className = 'sel-badge sel-badge--on';
            badge.textContent = '已选';
            if (countdownEl) countdownEl.before(badge);
        } else if (isElective && hasSelection) {
            card.classList.add('subject-dimmed');
            const badge = document.createElement('span');
            badge.className = 'sel-badge sel-badge--off';
            badge.textContent = '未选';
            if (countdownEl) countdownEl.before(badge);
        }
    });
}

// ============================================================
//  渲染
// ============================================================

// pad2 / splitDuration 等纯函数在 time.js

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
        hdr.innerHTML = `<span class="day-num">${dateKey}</span><span class="day-date">${dateLabels[Number(dateKey)]}</span>`;
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
                <span class="exam-main">
                    <span class="name">${ex.name}</span>
                    <span class="meta">
                        <span class="time-range">${startH}:${startM} – ${endH}:${endM}</span>
                        <span class="tag ${tagClasses[ex.tag]}">${tagLabels[ex.tag]}</span>
                        <span class="dur-note">${durStr}</span>
                    </span>
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

/* v2.1.0：给各区块加实色页眉，作为整卡的色块起点。
   只在这里插入一次；之后由 updateAll 增量更新其中的文字，
   避免每秒重建 DOM（原实现正是靠 cacheDom 的引用做增量更新）。 */
(function initCardBands() {
    // 当前考试进程：页眉文字由 updateAll 更新
    const ce = document.getElementById('currentExam');
    if (ce && !ce.querySelector('.card-band')) {
        const band = document.createElement('div');
        band.className = 'card-band';
        band.innerHTML = '<span id="ceBandTitle">当前考试</span>' +
                         '<span class="cb-note" id="ceBandNote">—</span>';
        ce.prepend(band);
    }
    // 选科：静态页眉
    const ss = document.getElementById('subjectSelector');
    if (ss && !ss.querySelector('.card-band')) {
        const band = document.createElement('div');
        band.className = 'card-band';
        band.innerHTML = '<span>我的选科</span>' +
                         '<span class="cb-note" id="ssBandNote">点击标记</span>';
        ss.prepend(band);
    }
    // 日程卡：页眉已在 index.html 中静态写好，这里只同步场次提示，
    // 并隐藏卡内那行重复的标题（页眉已经说了「考试日程」）
    const note = document.getElementById('scheduleBandNote');
    if (note) setText(note, exams.length + ' 场 · 4 天');
    const root = document.getElementById('scheduleRoot');
    const dupTitle = root && root.parentElement
        ? root.parentElement.querySelector('.section-title') : null;
    if (dupTitle) dupTitle.style.display = 'none';
})();

// 缓存 DOM（此时卡片已存在）
cacheDom();

// 先读取用户设置，再据此推导科目日程（高考日期与科目日程同源）
loadPhaseSettings();
examDates = computeExamDates();

/**
 * 骨架屏淡出。
 *
 * 这里原先只靠 transitionend 来移除元素，实测在部分情况下该事件不会触发
 * （首帧内同时写入 transition 与 opacity，浏览器可能直接视为终态、不产生过渡；
 *  标签页在后台、元素未参与绘制、或过渡被中断时同样不会派发），
 * 结果骨架屏永久留在 DOM 中盖住正文，表现为白屏。
 *
 * 因此改为三重保障：transitionend、兜底定时器、以及淡出结束后强制 display:none。
 * 无论哪条先到都只执行一次；即使过渡完全不触发，也会在超时后被隐藏并移除。
 */
function hideSkeleton() {
    const sk = dom.skeleton;
    if (!sk || !sk.parentNode) return;

    let done = false;
    let timer = 0;
    const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // 兜底：即便过渡从未发生（opacity 仍为 1），也必须让骨架屏退出视觉层
        sk.style.display = 'none';
        if (sk.parentNode) sk.remove();
    };

    sk.style.transition = 'opacity 0.4s ease';
    sk.style.opacity = '0';
    sk.addEventListener('transitionend', (e) => {
        if (e.target === sk && e.propertyName === 'opacity') finish();
    });

    // 兜底：略长于 0.4s 过渡时长
    timer = setTimeout(finish, 700);
}

// 先让首帧完成样式计算，再触发淡出，确保 opacity 真的发生过渡
requestAnimationFrame(() => {
    requestAnimationFrame(hideSkeleton);
});

// ============================================================
//  更新所有倒计时
// ============================================================

let lastTick = 0;
let lastSelectionSnapshot = '';
let lastA11yKey = '';
let lastPhaseStatusKey = '';

/** 只在内容真的变化时写入，减少每帧无谓的 DOM 触碰 */
function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
}

function updateAll(force) {
    const now = new Date();

    // 阶段导航徽章：任何阶段下都可能随时间翻转
    syncPhaseNavStatus();

    // 非高考阶段：Hero 与阶段详情同源，走 updatePhaseHero
    if (activePhaseId !== 'final') {
        updatePhaseHero();
        updatePhaseDetail();
        return;
    }

    // --- 总体倒计时（高考）---
    // 与阶段系统同源：高考日期若被用户修改，这里随之变化
    const gkStart = getGaokaoStart();
    const gkEnd = getGaokaoEnd();
    const state = targetState(now, gkStart, gkEnd);
    const ongoing = state === 'ongoing';

    if (ongoing) {
        setHero(gkEnd - now, '距全部结束还有');
    } else if (state === 'waiting') {
        setHero(gkStart - now, `距 ${GAOKAO_YEAR} 年高考还有`);
    } else {
        setHero(bjDate(GAOKAO_YEAR + 1, 6, 7, 0, 0) - now, `距 ${GAOKAO_YEAR + 1} 年高考还有`);
    }
    // P1-5：接通 Hero 脉冲动画（原实现只在永不执行的分支里 add，属死代码）
    dom.heroSection.classList.toggle('ongoing', ongoing);
    dom.statusMsg.classList.toggle('show', ongoing);

    /* setHero 内已更新 dom.heroLabel */
    setText(dom.yearBadge, COHORT_LABEL);

    // 读屏播报：仅在分钟级变化时更新，避免每秒打扰
    const a11yKey = `${dom.hDays.textContent}-${dom.hHours.textContent}-${dom.hMins.textContent}`;
    if (a11yKey !== lastA11yKey) {
        lastA11yKey = a11yKey;
        setText(dom.heroA11y,
            `${dom.heroLabel.textContent} ${dom.hDays.textContent} 天 ` +
            `${dom.hHours.textContent} 小时 ${dom.hMins.textContent} 分`);
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
            const { d, h, m, s } = splitDuration(start - now);
            setText(dEl, pad2(d));
            setText(hEl, pad2(h));
            setText(mEl, pad2(m));
            setText(sEl, pad2(s));

            if (wasDone) {
                const b = card.querySelector('.exam-done-badge');
                if (b) b.remove();
            }
        } else if (now >= start && now <= end) {
            card.classList.add('exam-now');
            const { h, m, s } = splitDuration(end - now);
            setText(dEl, '00');
            setText(hEl, pad2(h));
            setText(mEl, pad2(m));
            setText(sEl, pad2(s));

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
            setText(dEl, '');
            setText(hEl, '');
            setText(mEl, '');
            setText(sEl, '');

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
        if (selectedSubjects.length > 0 && !isExamRelevant(ex, selectedSubjects)) continue;
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
        setText(document.getElementById('ceBandNote'), `${current.name} ${sh}:${sm}–${eh}:${em}`);
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
        setText(document.getElementById('ceBandNote'), `下一场 ${next.name} ${sh}:${sm}`);
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
        setText(document.getElementById('ceBandNote'), '已全部完成');
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
    const { d, h, m, s } = splitDuration(diff);

    setText(dom.hDays, pad2(d));
    setText(dom.hHours, pad2(h));
    setText(dom.hMins, pad2(m));
    setText(dom.hSecs, pad2(s));
    setText(dom.heroLabel, label);
}

// 首次渲染
updateAll(true);

// 使用 requestAnimationFrame 驱动更新，每秒最多执行一次。
// 全屏覆盖层打开时同步刷新，替代原先独立的 setInterval。
function tickLoop(time) {
    if (time - lastTick >= 1000) {
        lastTick = time;
        updateAll();
        if (fsOverlay.classList.contains('open')) updateFullscreen();
        if (pipWindow && !pipWindow.closed) updatePipContent();
    }
    requestAnimationFrame(tickLoop);
}
requestAnimationFrame(tickLoop);

// ============================================================
//  主题切换（v2.1.0：多主题 + 字号档 + 明暗三态）
//  ------------------------------------------------------------
//  维度彼此独立，互不覆盖：
//    data-theme  配色主题（ink / night / board / celadon / camp）
//    data-size   字号档（std / lg / xl）—— 供投屏/大屏使用
//    gaokao_appearance  明暗：auto 跟随系统 / light / dark
//
//  存储兼容：旧版只有一个 gaokao_theme（'dark' | 'light'）。
//  v2.1.0 起拆成 gaokao_theme_id + gaokao_appearance，
//  读取时若发现旧键会平滑迁移，老用户设置不丢。
// ============================================================

const THEMES = [
    { id: 'ink',     name: '砚台', dots: ['#F5F1EA', '#FFFDFA', '#B5722E'] },
    { id: 'night',   name: '夜航', dots: ['#0E1116', '#161B22', '#F0B357'] },
    { id: 'board',   name: '白板', dots: ['#FFFFFF', '#F2F3F5', '#D0322B'] },
    { id: 'celadon', name: '青瓷', dots: ['#F2F5F4', '#FFFFFF', '#0F6E68'] },
    { id: 'camp',    name: '露营', dots: ['#FFF6E9', '#E8892B', '#5FB7D4'] }
];
const THEME_IDS = THEMES.map(t => t.id);
const DEFAULT_THEME = 'ink';

/* 每套主题自带的明暗身份。
   这一点很关键：如果「明暗」与「配色」可以自由交叉，就会出现
   「深色 + 砚台（暖纸）」这种自相矛盾、或「浅色 + 夜航」几乎不可读的组合。
   所以明暗档本质是「在浅色主题与深色主题之间切换」，
   每套配色都声明自己属于哪一侧。 */
const THEME_DARK = { night: true, ink: false, board: false, celadon: false, camp: false };

const SIZES = [
    { id: 'std', name: '标准' },
    { id: 'lg',  name: '大' },
    { id: 'xl',  name: '超大' }
];
const SIZE_IDS = SIZES.map(s => s.id);

const APPEARANCES = [
    { id: 'auto',  name: '自动' },
    { id: 'light', name: '浅色' },
    { id: 'dark',  name: '深色' }
];

const themeToggle = document.getElementById('themeToggle');
const themeMenu = document.getElementById('themeMenu');

/* appliedThemeId 是唯一真相来源：它既是实际生效的配色，
   也是「再切换到明暗档时」所依据的那个配色。
   之前用 themeId（用户意图）参与推导，会出现
   「themeId=ink 但 applied=night，于是永远推不出 ink」的死锁。 */
let appliedThemeId = DEFAULT_THEME;
let autoPairThemeId = null;      // 「自动」模式下，系统为浅色时使用的配色
let sizeId = 'std';
let appearance = 'auto';         // auto | light | dark（仅用于菜单回显）

function readStored(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
}
function writeStored(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
}

/** 系统当前是否偏好暗色 */
function systemPrefersDark() {
    try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) { return false; }
}

/** 由「明暗档 + 当前生效配色」解出目标配色。
    明暗档只决定「去浅色侧还是深色侧」，不再另存一套意图配色，
    从根上避免意图与结果分叉。 */
function targetThemeId() {
    if (appearance === 'auto') {
        return systemPrefersDark() ? 'night' : (autoPairThemeId || DEFAULT_THEME);
    }
    if (appearance === 'dark') return 'night';
    return autoPairThemeId || DEFAULT_THEME;
}

function loadTheme() {
    // 新键优先
    let id = readStored('gaokao_theme_id');
    let ap = readStored('gaokao_appearance');
    const legacy = readStored('gaokao_theme');

    /* 旧键迁移：v2.0.x 只有 gaokao_theme（'dark' | 'light'）。
       必须把 'dark' 映射到深色主题（night），否则老用户升级后会
       从深色界面突然变成浅色的「砚台」—— 这是可见的体验倒退。 */
    if (!id && !ap && (legacy === 'dark' || legacy === 'light')) {
        ap = legacy;
        id = legacy === 'dark' ? 'night' : DEFAULT_THEME;
        writeStored('gaokao_appearance', ap);
        writeStored('gaokao_theme_id', id);
    }

    if (id && THEME_IDS.indexOf(id) >= 0) appliedThemeId = id;
    if (ap && APPEARANCES.some(a => a.id === ap)) appearance = ap;

    // 浅色侧记忆：只在当前生效的是浅色主题时更新
    const pair = readStored('gaokao_pair_theme_id');
    if (pair && THEME_IDS.indexOf(pair) >= 0) autoPairThemeId = pair;
    else if (!THEME_DARK[appliedThemeId]) autoPairThemeId = appliedThemeId;
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', appliedThemeId);
    document.documentElement.setAttribute('data-size', sizeId);
    syncThemeUI();
    refreshThemeConsumers();
}

/** 全屏层与 PiP 的主题色是运行时读取计算样式的，切换后必须重算。
    这两个变量的声明在本文件中位于主题段落之后，直接引用会命中暂时性死区，
    所以用 typeof 守卫；首屏由文末的 applyTheme() 负责。 */
function refreshThemeConsumers() {
    if (typeof fsOverlay !== 'undefined' && fsOverlay &&
        fsOverlay.classList.contains('open')) {
        updateFullscreen();
    }
    if (typeof pipWindow !== 'undefined' && pipWindow && !pipWindow.closed) {
        updatePipContent();
    }
}

/** 同步菜单选中态与按钮文案 */
function syncThemeUI() {
    if (!themeToggle) return;
    const applied = THEMES.filter(t => t.id === appliedThemeId)[0] || THEMES[0];
    const size = SIZES.filter(s => s.id === sizeId)[0] || SIZES[0];
    const apName = (APPEARANCES.filter(a => a.id === appearance)[0] || APPEARANCES[0]).name;
    // 显示「实际生效」的配色，避免出现「按钮写砚台、界面却是夜航」的错位
    setText(themeToggle, '主题 · ' + applied.name);
    themeToggle.title = '配色 ' + applied.name + ' · 字号 ' + size.name + ' · ' + apName;
    themeToggle.setAttribute('aria-expanded', String(themeMenu && themeMenu.classList.contains('open')));

    if (!themeMenu) return;
    themeMenu.querySelectorAll('[data-theme-id]').forEach(el => {
        el.setAttribute('aria-pressed', String(el.dataset.themeId === appliedThemeId));
    });
    themeMenu.querySelectorAll('[data-size-id]').forEach(el => {
        el.setAttribute('aria-pressed', String(el.dataset.sizeId === sizeId));
    });
    themeMenu.querySelectorAll('[data-appearance]').forEach(el => {
        const isDarkNow = !!THEME_DARK[appliedThemeId];
        // 回显的是实际状态：当前在深色侧就点亮「深色」，否则点亮「浅色」
        const on = appearance === 'auto'
            ? el.dataset.appearance === 'auto'
            : (isDarkNow ? el.dataset.appearance === 'dark'
                         : el.dataset.appearance === 'light');
        el.setAttribute('aria-pressed', String(on));
    });}

function renderThemeMenu() {
    if (!themeMenu) return;
    const swatch = (t) =>
        '<button type="button" class="tm-swatch" data-theme-id="' + t.id + '" aria-pressed="false">' +
        '<span class="dots" aria-hidden="true">' +
        t.dots.map(c => '<i style="background:' + c + '"></i>').join('') +
        '</span>' + t.name + '</button>';

    themeMenu.innerHTML =
        '<div class="tm-head">' +
        '<span class="tm-title">外观</span>' +
        '<button type="button" class="tm-close" id="themeMenuClose" aria-label="关闭外观设置">✕</button>' +
        '</div>' +

        '<div class="tm-group"><span class="tm-label">配色</span>' +
        '<div class="tm-grid">' + THEMES.map(swatch).join('') + '</div></div>' +

        '<div class="tm-group"><span class="tm-label">字号（投屏 / 大屏）</span>' +
        '<div class="tm-grid cols-3">' +
        SIZES.map(s => '<button type="button" class="tm-swatch" data-size-id="' + s.id +
            '" aria-pressed="false">' + s.name + '</button>').join('') +
        '</div></div>' +

        '<div class="tm-group"><span class="tm-label">明暗</span>' +
        '<div class="tm-grid cols-3">' +
        APPEARANCES.map(a => '<button type="button" class="tm-swatch" data-appearance="' + a.id +
            '" aria-pressed="false">' + a.name + '</button>').join('') +
        '</div>' +
        '<p class="tm-hint">「自动」跟随系统偏好：白天用你选的配色，' +
        '夜间自动切到深色主题。</p></div>';

    themeMenu.addEventListener('click', (e) => {
        const t = e.target.closest('[data-theme-id]');
        const s = e.target.closest('[data-size-id]');
        const a = e.target.closest('[data-appearance]');

        if (t) {
            /* 点配色 = 直接采用该配色，并让明暗档与之保持一致。
               这是本次修复的核心：以前「明暗」一旦被设成 dark，
               就会把之后选的所有配色都强制成 night，用户看不到任何变化。 */
            appliedThemeId = t.dataset.themeId;
            appearance = THEME_DARK[appliedThemeId] ? 'dark' : 'light';
            if (!THEME_DARK[appliedThemeId]) autoPairThemeId = appliedThemeId;
            writeStored('gaokao_theme_id', appliedThemeId);
            writeStored('gaokao_appearance', appearance);
            if (autoPairThemeId) writeStored('gaokao_pair_theme_id', autoPairThemeId);
            applyTheme();
        } else if (s) {
            sizeId = s.dataset.sizeId;
            writeStored('gaokao_size', sizeId);
            applyTheme();
        } else if (a) {
            appearance = a.dataset.appearance;
            writeStored('gaokao_appearance', appearance);
            // 明暗档只决定去浅色侧还是深色侧，具体用哪套配色由记忆决定
            appliedThemeId = targetThemeId();
            writeStored('gaokao_theme_id', appliedThemeId);
            applyTheme();
        }
    });
    themeMenu.querySelector('#themeMenuClose').addEventListener('click', closeThemeMenu);
}

/** 菜单定位：贴住触发按钮，越界时自动翻转 */
function positionThemeMenu() {
    if (!themeMenu || !themeToggle) return;
    const r = themeToggle.getBoundingClientRect();
    const mw = themeMenu.offsetWidth || 320;
    const mh = themeMenu.offsetHeight || 320;
    let left = Math.min(r.left, window.innerWidth - mw - 8);
    let top = r.top - mh - 8;                       // 默认向上弹（操作栏在底部）
    if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - mh - 8);
    themeMenu.style.left = Math.max(8, left) + 'px';
    themeMenu.style.top = Math.max(8, top) + 'px';
}

function openThemeMenu() {
    if (!themeMenu) return;
    themeMenu.classList.add('open');
    themeMenu.setAttribute('aria-hidden', 'false');
    positionThemeMenu();
    syncThemeUI();
    const first = themeMenu.querySelector('.tm-swatch');
    if (first) first.focus();
    document.addEventListener('keydown', themeMenuKeydown);
    document.addEventListener('click', themeMenuOutsideClick, true);
}

function closeThemeMenu() {
    if (!themeMenu) return;
    if (!themeMenu.classList.contains('open')) return;
    themeMenu.classList.remove('open');
    themeMenu.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', themeMenuKeydown);
    document.removeEventListener('click', themeMenuOutsideClick, true);
    syncThemeUI();
    if (themeToggle) themeToggle.focus();
}

function themeMenuKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeThemeMenu(); }
}

function themeMenuOutsideClick(e) {
    if (themeMenu.contains(e.target) || (themeToggle && themeToggle.contains(e.target))) return;
    closeThemeMenu();
}

if (themeToggle && themeMenu) {
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (themeMenu.classList.contains('open')) closeThemeMenu();
        else openThemeMenu();
    });
    renderThemeMenu();
}

// 系统偏好变化时，仅「自动」模式需要跟随
try {
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onSysChange = () => { if (appearance === 'auto') applyTheme(); };
        if (mq.addEventListener) mq.addEventListener('change', onSysChange);
        else if (mq.addListener) mq.addListener(onSysChange);
    }
} catch (_) {}

loadTheme();
// 这里只读取存储；真正落地（并可能触发全屏/PiP 重算）放在文件末尾
window.addEventListener('resize', () => {
    if (themeMenu && themeMenu.classList.contains('open')) positionThemeMenu();
});

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
    // 小窗配色直接读当前主题的 token，而不是另写一套写死的浅/深色值。
    // 原先判断的是 data-theme === 'dark' —— 那是 v2.0 的旧主题名，
    // v2.1 之后主题是 ink/night/board/celadon/camp，判断永远为假，
    // 于是夜航主题下的小窗也是一片浅色。
    const rs = getComputedStyle(document.documentElement);
    const tok = (name, fallback) => {
        const v = rs.getPropertyValue(name).trim();
        return v || fallback;
    };
    const bg = tok('--bg', '#f8f4ee');
    const cardBg = tok('--bg-card', '#ffffff');
    const textMain = tok('--text', '#3a3228');
    const textSec = tok('--text-2', '#a09080');
    const text3 = tok('--text-3', '#9c8a76');
    const accent = tok('--accent', '#c8946a');
    const border = tok('--border', '#e8e0d8');
    const borderStrong = tok('--border-strong', '#cdbfa9');
    const fontSans = tok('--font-sans', '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif');
    const rBtn = tok('--r-btn', '5px');
    const rSharp = tok('--r-sharp', '2px');

    const baseSize = Math.max(8, Math.min(winW, winH * 1.8) / 22);
    // 大天数按窗口宽高双约束，永不溢出
    const daySize = Math.min(winW * 0.34, winH * 0.42, baseSize * 3.6);
    const unitSize = daySize * 0.26;
    const subSize = Math.min(winW * 0.075, winH * 0.14, baseSize * 0.86);

    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
    font-family: ${fontSans};
    background: ${bg};
    color: ${textMain};
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: ${baseSize * 0.5}px;
    user-select: none;
}
/* 目标行：与 demo 的 .h-target 同一层级（小字、字距大） */
.pip-label {
    font-size: ${baseSize * 0.62}px;
    color: ${text3};
    letter-spacing: 2px;
    margin-bottom: ${baseSize * 0.22}px;
    flex-shrink: 0;
    text-align: center;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}
/* 大天数 + 单位：与页面 Hero / 全屏同一套数字层级 */
.pip-main {
    display: flex; align-items: baseline; justify-content: center;
    gap: ${baseSize * 0.12}px;
    white-space: nowrap;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    line-height: .9;
}
.pip-main .num {
    font-size: ${daySize}px;
    font-weight: 800;
    letter-spacing: -.02em;
    color: ${accent};
    white-space: nowrap;
}
.pip-main .unit {
    font-size: ${unitSize}px;
    font-weight: 700;
    letter-spacing: .04em;
    color: ${textSec};
    white-space: nowrap;
}
/* 次级精确行：左侧一道实色竖线，与页面 Hero 的 .t-rest 同构 */
.pip-sub {
    display: flex; align-items: baseline; justify-content: center;
    gap: ${baseSize * 0.14}px;
    margin-top: ${baseSize * 0.3}px;
    padding-left: ${baseSize * 0.3}px;
    border-left: 3px solid ${accent};
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: ${subSize}px;
    color: ${textMain};
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
}
.pip-sub .u2 { font-size: .5em; opacity: .7; margin-left: 1px; font-family: ${fontSans}; }
.pip-sub .sep { opacity: .45; }
/* 下一场：直角小条，走卡片的描边语言而不是圆角胶囊 */
.pip-next {
    margin-top: ${baseSize * 0.45}px;
    padding: ${baseSize * 0.26}px ${baseSize * 0.5}px;
    background: ${cardBg};
    border-radius: ${rBtn};
    border: 1.5px solid ${borderStrong};
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    max-width: ${Math.min(winW - baseSize, 340)}px;
    flex-shrink: 0;
    font-size: ${baseSize * 0.62}px;
}
.pip-next .label { color: ${text3}; white-space: nowrap; letter-spacing: 1px; }
.pip-next .name {
    color: ${textMain}; font-weight: 700; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    margin: 0 ${baseSize * 0.3}px; flex: 1;
}
.pip-next .time {
    color: ${accent}; font-weight: 700;
    font-variant-numeric: tabular-nums; white-space: nowrap;
}
</style>
</head>
<body>
    <div class="pip-label" id="pipLabel">距 2027 年高考还有</div>
    <div class="pip-main">
        <span class="num" id="pipD">--</span><span class="unit">天</span>
    </div>
    <div class="pip-sub">
        <span><b id="pipH">--</b><span class="u2">时</span></span>
        <span class="sep">:</span>
        <span><b id="pipM">--</b><span class="u2">分</span></span>
        <span class="sep">:</span>
        <span><b id="pipS">--</b><span class="u2">秒</span></span>
    </div>
    <div class="pip-next">
        <span class="label">下一场</span>
        <span class="name" id="pipNext">—</span>
        <span class="time" id="pipNextTime">—</span>
    </div>
</body>
</html>`);
    doc.close();
}

function updatePipContent() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const now = new Date();

    // 复用全局同源日期（原先在此重复声明，遮蔽了外层常量）
    const gkStart = getGaokaoStart();
    const gkEnd = getGaokaoEnd();
    let diff, label;
    if (now >= gkStart && now <= gkEnd) {
        diff = gkEnd - now;
        label = '距全部结束还有';
    } else if (now < gkStart) {
        diff = gkStart - now;
        label = `距 ${GAOKAO_YEAR} 年高考还有`;
    } else {
        diff = bjDate(GAOKAO_YEAR + 1, 6, 7, 0, 0) - now;
        label = `距 ${GAOKAO_YEAR + 1} 年高考还有`;
    }

    const { d, h, m, s } = splitDuration(diff);

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
        if (selectedSubjects.length > 0 && !isExamRelevant(ex, selectedSubjects)) continue;
        const s = getExamStart(ex);
        if (now < s) {
            nextName = ex.name;
            const d2 = splitDuration(s - now);
            nextTime = d2.d > 0 ? `${d2.d}天` : `${pad2(d2.h)}:${pad2(d2.m)}`;
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

// isExamRelevant 已移至 time.js（按传入的选科判断，避免隐式依赖全局状态）

/** 全屏进度条整块（.fs-progress-wrap）——用选择器定位，避免脆弱的 parentElement 链 */
function fsProgressWrap() {
    return document.querySelector('#fsOverlay .fs-progress-wrap');
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
        const wrap = fsProgressWrap();
        if (wrap) wrap.style.display = 'none';
        document.getElementById('fsCurTime').style.display = 'none';

        document.getElementById('fsCurLabel').textContent = cfg.name;
        document.getElementById('fsCurName').textContent = status === 'upcoming' ? '即将开始'
            : status === 'ongoing' ? '进行中' : '已完成';

        document.getElementById('fsCurTime').textContent =
            `${fmtCnFull(start)} - ${fmtCnMonthDay(end)}`;

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
        // 非高考阶段：大数字数的是该阶段的开考/结束，同样要说清楚
        const clPhase = document.getElementById('fsCountLabel');
        if (clPhase) {
            clPhase.textContent = now < start ? `距 ${cfg.name} 开考还有`
                : (now <= end ? `距 ${cfg.name} 结束还有` : `${cfg.name} 已结束`);
        }
        return;
    }

    // 恢复显示高考专有元素
    document.getElementById('fsStatusBar').style.display = '';
    document.getElementById('fsNext').style.display = '';
    document.getElementById('fsSummary').style.display = '';
    const wrap = fsProgressWrap();
    if (wrap) wrap.style.display = '';
    document.getElementById('fsCurTime').style.display = '';

    let hasCurrent = false, curExam = null;
    for (const ex of exams) {
        if (!isExamRelevant(ex, selectedSubjects)) continue;
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

    // 顶部这行只说明「现在处于什么状态」。
    // 具体是哪一场、几点开考、还有多久，都在底部信息条里说 ——
    // 原先这行也写「下一场 语文 09:00 ~ 11:30」，与底部完全重复。
    document.getElementById('fsCurLabel').textContent =
        hasCurrent ? '当前考试' : (allDone ? '高考进程' : '备考中');
    // 待考/结束时这行不重复状态条里的文案（「等待开考」「已全部完成」），
    // 也不显示一个与「下一场」无关的时段
    if (!hasCurrent) {
        document.getElementById('fsCurName').textContent = '';
        document.getElementById('fsCurTime').textContent = '';
    }

    const fsDd = document.getElementById('fsDd');
    const fsDh = document.getElementById('fsDh');
    const fsDm = document.getElementById('fsDm');
    const fsDs = document.getElementById('fsDs');

    let targetEnd = null;
    for (const ex of exams) {
        if (!isExamRelevant(ex, selectedSubjects)) continue;
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
        // 说清大数字在数什么：进行中数到本场结束，未开考数到下一场开考，
        // 全部结束后数到次年高考。没有这行，「距开考」会被误读成进度条那个数。
        const cl = document.getElementById('fsCountLabel');
        if (cl) {
            cl.textContent = hasCurrent ? '距本场结束还有'
                : (allDone ? `距 ${GAOKAO_YEAR + 1} 年高考还有` : '距开考还有');
        }
    } else {
        fsDd.textContent = '—'; fsDh.textContent = '—';
        fsDm.textContent = '—'; fsDs.textContent = '—';
        const clNone = document.getElementById('fsCountLabel');
        if (clNone) clNone.textContent = '全部考试已结束';
    }

    // 底部「下一场」：正在进行时这里显示的是**当前场次的结束时间**，
    // 与顶部大数字（数到本场结束）指向同一时刻，不会出现两个不同的数。
    let nextName = '—', nextTime = '—', nextCountdown = '—';
    for (const ex of exams) {
        if (!isExamRelevant(ex, selectedSubjects)) continue;
        const s = getExamStart(ex), e = getExamEnd(ex);
        if (now >= s && now <= e) {
            nextName = ex.name;
            nextTime = '至 ' + pad2(ex.end[0]) + ':' + pad2(ex.end[1]);
            break;
        }
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

    // 进行中时底部改称「本场」，避免「下一场」与顶部「距本场结束」互相矛盾
    const footLabel = document.querySelector('#fsNext .fs-foot-l');
    if (footLabel) footLabel.textContent = hasCurrent ? '本场' : '下一场';

    if (allDone) {
        document.getElementById('fsNext').style.display = 'none';
    } else {
        document.getElementById('fsNext').style.display = 'flex';
        document.getElementById('fsNextName').textContent      = nextName;
        document.getElementById('fsNextTime').textContent      = nextTime;
        document.getElementById('fsNextCountdown').textContent = nextCountdown;
    }

    const relevantExams = exams.filter(ex => isExamRelevant(ex, selectedSubjects));
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

// ------------------------------------------------------------
//  滚动锁
//  ------------------------------------------------------------
//  不能用 `overflow: hidden`。原因：
//  把 html/body 设成 hidden 会**改变 sticky 元素的滚动容器** ——
//  滚动容器从视口变成 html/body 本身，而它此时并不滚动，
//  于是吸附偏移量塌缩、根元素回到滚动位置 0，左栏的主倒计时瞬间被顶出视口
//  （实测：弹窗打开瞬间 hero.top 由 16 变成 -377，也就是「突兀消失」）。
//
//  也不能用 `body { position: fixed }`：那会让 body 成为 fixed 定位的
//  包含块，覆盖层（`.modal-overlay` / `.fs-overlay` 都是 position:fixed）
//  会改为相对 body 定位，反而错位。
//
//  这里改用**冻结滚动位置**：不改变任何布局，只把滚动位置按住。
//  对 sticky 没有任何影响（滚动容器仍是视口），覆盖层也照常相对视口定位。
const SCROLL_KEYS = {
    ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ' ': 1, Spacebar: 1
};
let scrollLockY = 0;
let scrollLockOn = false;

function holdScrollPosition() {
    if (!scrollLockOn) return;
    if (window.scrollY !== scrollLockY) window.scrollTo(0, scrollLockY);
}

function onScrollLockKey(e) {
    const t = e.target;
    // 表单控件里要放行方向键等按键
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              (t.isContentEditable === true))) return;
    if (SCROLL_KEYS[e.key]) e.preventDefault();
}

function lockScroll(lock) {
    if (lock) {
        scrollLockY = window.scrollY || window.pageYOffset || 0;
        scrollLockOn = true;
        window.addEventListener('scroll', holdScrollPosition, { passive: true });
        window.addEventListener('wheel', holdScrollPosition, { passive: true });
        window.addEventListener('touchmove', holdScrollPosition, { passive: true });
        window.addEventListener('keydown', onScrollLockKey);
    } else {
        scrollLockOn = false;
        window.removeEventListener('scroll', holdScrollPosition);
        window.removeEventListener('wheel', holdScrollPosition);
        window.removeEventListener('touchmove', holdScrollPosition);
        window.removeEventListener('keydown', onScrollLockKey);
        // 兜底：把位置精确还原
        if (scrollLockY) window.scrollTo(0, scrollLockY);
        scrollLockY = 0;
    }
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

// 全屏刷新已合并进 tickLoop（每秒一次），不再单独占用一个 setInterval

// ============================================================
//  v2.0.0 - 诊断考试阶段管理
// ============================================================

// PHASE_CONFIG / PHASE_ORDER 已移至 time.js（单一数据源）
// 高考阶段日期由 GAOKAO_YEAR 推导，跨年自动跟随，不再硬编码。

function loadPhaseSettings() {
    try {
        const saved = localStorage.getItem('gaokao_phase_settings');
        if (saved) phaseOverrides = JSON.parse(saved);
    } catch (_) {
        phaseOverrides = {};
    }
    if (!phaseOverrides || typeof phaseOverrides !== 'object') phaseOverrides = {};
}

function savePhaseSettings() {
    try {
        localStorage.setItem('gaokao_phase_settings', JSON.stringify(phaseOverrides));
    } catch (_) {}
}

/** 校验一条覆盖数据是否合法（防止损坏的 localStorage 让页面崩掉） */
function isSaneOverride(ov) {
    if (!ov || typeof ov !== 'object') return false;
    const keys = ['startYear', 'startMonth', 'startDay', 'endYear', 'endMonth', 'endDay'];
    if (!keys.every(k => Number.isInteger(ov[k]))) return false;
    const [minY, maxY] = [2020, 2100];
    if (ov.startYear < minY || ov.startYear > maxY) return false;
    if (ov.endYear < minY || ov.endYear > maxY) return false;
    if (ov.startMonth < 1 || ov.startMonth > 12) return false;
    if (ov.endMonth < 1 || ov.endMonth > 12) return false;
    if (ov.startDay < 1 || ov.startDay > 31) return false;
    if (ov.endDay < 1 || ov.endDay > 31) return false;
    return bjDate(ov.endYear, ov.endMonth, ov.endDay) >= bjDate(ov.startYear, ov.startMonth, ov.startDay);
}

/** 取得某阶段的起止日期（用户覆盖优先，非法覆盖自动忽略并回退默认） */
function getPhaseDates(phaseId) {
    const cfg = PHASE_CONFIG[phaseId];
    const ov = phaseOverrides[phaseId];
    const use = isSaneOverride(ov) ? ov : null;

    if (ov && !use && !isSaneOverride.warned?.[phaseId]) {
        isSaneOverride.warned = isSaneOverride.warned || {};
        isSaneOverride.warned[phaseId] = true;
        console.warn('[gaokao] 忽略了非法的日期设置:', phaseId, ov);
    }

    // 注意：默认值用 {year,month,day}，覆盖值用 {startYear,...,endDay}，两者字段名不同
    const sy = use ? use.startYear : cfg.defaultStart.year;
    const sm = use ? use.startMonth : cfg.defaultStart.month;
    const sd = use ? use.startDay : cfg.defaultStart.day;
    const ey = use ? use.endYear : cfg.defaultEnd.year;
    const em = use ? use.endMonth : cfg.defaultEnd.month;
    const ed = use ? use.endDay : cfg.defaultEnd.day;

    return {
        start: bjDate(sy, sm, sd),
        end: bjDate(ey, em, ed),
    };
}

/** 阶段顺序自检（仅开发期提示，不影响渲染） */
function assertPhaseOrder() {
    let prevId = null;
    for (const id of PHASE_ORDER) {
        const t = getPhaseDates(id).start.getTime();
        if (prevId !== null && t < prevId.at) {
            console.warn('[gaokao] 阶段日期未按顺序递增:', prevId.id, '→', id);
        }
        prevId = { id, at: t };
    }
}

function getPhaseStatus(phaseId) {
    const now = new Date();
    const { start, end } = getPhaseDates(phaseId);
    return targetState(now, start, end) === 'waiting' ? 'upcoming'
        : targetState(now, start, end) === 'ongoing' ? 'ongoing' : 'done';
}

// ---- 阶段导航 ----
/**
 * 当前真实阶段 = **下一个尚未结束的阶段**。
 *
 * 语义修正（对齐 demo）：零诊已结束、一诊未开始时，考生正要面对的是一诊，
 * 而「高考」还在 246 天之后。早先 railMode 直接取 activePhaseId（默认 'final'），
 * 于是头部写着「当前：高考」，与「距高考还有 246 天」自相矛盾。
 * 全部阶段结束后返回 null。
 */
function currentPhaseId() {
    const now = new Date();
    for (const id of PHASE_ORDER) {
        if (getPhaseDates(id).end >= now) return id;
    }
    return null;
}

/** 正在查看的阶段是否已结束 */
function isViewingPastPhase() {
    return getPhaseStatus(activePhaseId) === 'done';
}

/**
 * 轨道头部右侧文案 + 「回到当前阶段」按钮的显隐。
 *
 * 按钮的显隐条件是「**正在查看的阶段 ≠ 当前阶段**」，与它是过去还是未来无关。
 * 早先只对「已结束」的阶段显示，于是点二诊/三诊/高考都没有出口 ——
 * 用户得自己找回那个高亮节点才能回来，而他会读成「只有零诊有返回」。
 * 未来阶段同样需要一个明确的退路，语义上「回到当前阶段」对两者都成立。
 */
function syncRailMode() {
    const el = document.getElementById('railMode');
    const back = document.getElementById('railBack');
    const rail = document.getElementById('pgRail');
    const curId = currentPhaseId();
    const away = !!curId && activePhaseId !== curId;
    const past = isViewingPastPhase();

    // 轨道高亮只在「看历史」时打开：未来阶段不是历史，换色会误导
    if (rail) rail.classList.toggle('is-focused', past);

    if (el) {
        if (!curId) {
            el.textContent = '所有阶段已结束';
        } else if (away) {
            el.textContent = past
                ? '查看中：' + PHASE_CONFIG[activePhaseId].name + '（已结束）'
                : '查看中：' + PHASE_CONFIG[activePhaseId].name;
        } else {
            el.textContent = '当前：' + PHASE_CONFIG[curId].name;
        }
    }
    if (back) back.hidden = !away;
}

function initPhaseNav() {
    const nav = document.getElementById('phaseNav');
    if (!nav) return;
    PHASE_ORDER.forEach(id => {
        const cfg = PHASE_CONFIG[id];
        const status = getPhaseStatus(id);
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `phase-tab${status === 'done' ? ' done' : ''}${status === 'ongoing' ? ' live' : ''}${id === activePhaseId ? ' active' : ''}`;
        tab.dataset.phase = id;
        tab.setAttribute('aria-pressed', String(id === activePhaseId));
        tab.innerHTML = `
            <span>${cfg.name}</span>
            <span class="pt-sub">${status === 'done' ? '已结束' : status === 'ongoing' ? '进行中' : cfg.short}</span>
            ${status === 'done' ? '<span class="pt-badge">✓</span>' : ''}
        `;
        tab.addEventListener('click', () => switchPhase(id));
        nav.appendChild(tab);
    });
    lastPhaseStatusKey = PHASE_ORDER.map(id => getPhaseStatus(id)).join('|');
    syncRailMode();
}

/** 阶段状态随时间翻转时同步导航徽章（每秒调用，状态未变则不触 DOM） */
function syncPhaseNavStatus() {
    const key = PHASE_ORDER.map(id => getPhaseStatus(id)).join('|');
    if (key === lastPhaseStatusKey) return;
    lastPhaseStatusKey = key;

    document.querySelectorAll('.phase-tab').forEach(tab => {
        const id = tab.dataset.phase;
        const cfg = PHASE_CONFIG[id];
        const status = getPhaseStatus(id);
        tab.classList.toggle('done', status === 'done');
        tab.classList.toggle('live', status === 'ongoing');
        setText(tab.querySelector('.pt-sub'),
            status === 'done' ? '已结束' : status === 'ongoing' ? '进行中' : cfg.short);

        const hasBadge = !!tab.querySelector('.pt-badge');
        if (status === 'done' && !hasBadge) {
            const b = document.createElement('span');
            b.className = 'pt-badge';
            b.textContent = '✓';
            tab.appendChild(b);
        } else if (status !== 'done' && hasBadge) {
            tab.querySelector('.pt-badge').remove();
        }
    });
}

function switchPhase(phaseId) {
    if (phaseId === activePhaseId && phaseId !== 'final') return;
    activePhaseId = phaseId;

    document.querySelectorAll('.phase-tab').forEach(tab => {
        const on = tab.dataset.phase === phaseId;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-pressed', String(on));
    });
    syncRailMode();

    const isFinal = phaseId === 'final';
    document.getElementById('gaokaoContent').classList.toggle('hidden', !isFinal);
    // 阶段专有信息（全名 + 徽章）只在非高考阶段出现；
    // 倒计时本身始终由 Hero 一处承担，不再有第二张卡片。
    const phaseLine = document.getElementById('heroPhaseLine');
    if (phaseLine) phaseLine.classList.toggle('show', !isFinal);

    // 考试日程卡装的是 9 场高考科目，它必须跟着 #gaokaoContent 一起隐藏。
    //
    // v2.3.0 把它移出了 #gaokaoContent（为了和日历卡一起排在选科之后、
    // 日程收尾），于是「只隐藏 gaokaoContent」就不再够用 ——
    // 切到「一诊」时左栏已经是诊断倒计时，右栏却还挂着 9 场高考日程，
    // 页面上同时出现两套考试的倒计时，看起来就是「有残余」。
    const scheduleCard = document.getElementById('scheduleCard');
    if (scheduleCard) scheduleCard.classList.toggle('hidden', !isFinal);

    updatePhaseHero();
    if (!isFinal) updatePhaseDetail();
    if (fsOverlay.classList.contains('open')) updateFullscreen();
}

// ---- 「回到当前阶段」 ----
// 只在查看已结束阶段时可见（显隐由 syncRailMode 负责）。
// 回到「下一个尚未结束的阶段」；若全部结束则停在高考，不留一个死按钮。
(function bindRailBack() {
    const btn = document.getElementById('railBack');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const target = currentPhaseId() || 'final';
        switchPhase(target);
        const tab = document.querySelector(`.phase-tab[data-phase="${target}"]`);
        if (tab && tab.focus) tab.focus();
    });
})();

/**
 * Hero 倒计时唯一入口：
 * - 高考阶段复用同一套推算（含用户自定义的高考日期）；
 * - ongoing 类在此统一开关，接通原本永不触发的脉冲动画；
 * - 已结束时给出明确文案，不再停在「距结束还有」。
 */
function updatePhaseHero() {
    const now = new Date();
    const cfg = PHASE_CONFIG[activePhaseId];
    const { start, end } = getPhaseDates(activePhaseId);

    setText(dom.yearBadge, COHORT_LABEL);

    let ongoing = false;
    let label;

    if (now < start) {
        setHero(start - now, `距 ${cfg.name} 还有`);
        label = 'waiting';
    } else if (now <= end) {
        setHero(end - now, `距 ${cfg.name} 结束还有`);
        ongoing = true;
        label = 'ongoing';
    } else {
        const nextPhase = PHASE_ORDER.find(id => getPhaseDates(id).start > now);
        if (nextPhase) {
            setHero(getPhaseDates(nextPhase).start - now, `距 ${PHASE_CONFIG[nextPhase].name} 还有`);
        } else {
            setHero(0, '所有考试已结束 · 金榜题名');
        }
        label = 'done';
    }

    dom.heroSection.classList.toggle('ongoing', ongoing);
    // 仅高考进行中显示状态横幅
    dom.statusMsg.classList.toggle('show', ongoing && activePhaseId === 'final');

    // ---- v2.3.0：目标日期行 + 状态条（对齐 demo 的 .h-date / .stat-row） ----
    const heroDateEl = document.getElementById('heroDate');
    if (heroDateEl) {
        if (activePhaseId === 'final') {
            // 起止都用 computeExamDates() 的结果：用户改过高考日期后自动跟随
            const firstEx = examDates[0] || exams[0];
            const lastEx = examDates[examDates.length - 1] || exams[exams.length - 1];
            if (firstEx && lastEx) {
                setText(heroDateEl,
                    `${fmtCnFull(firstEx.start)} 开考 · ${fmtCnMonthDay(lastEx.end)} 结束`);
            } else {
                setText(heroDateEl, '');
            }
        } else {
            setText(heroDateEl, `${fmtCnFull(start)} 开始 · ${fmtCnMonthDay(end)} 结束`);
        }
    }
    buildHeroStats(activePhaseId, now);

    // 读屏播报（分钟级变化才更新）
    const a11yKey = `${label}|${dom.hDays.textContent}-${dom.hHours.textContent}-${dom.hMins.textContent}`;
    if (a11yKey !== lastA11yKey) {
        lastA11yKey = a11yKey;
        setText(dom.heroA11y,
            `${dom.heroLabel.textContent} ${dom.hDays.textContent} 天 ` +
            `${dom.hHours.textContent} 小时 ${dom.hMins.textContent} 分`);
    }
}

/**
 * Hero 状态条：备考状态 / 距下一场诊断 / 已完成场次占比。
 * 逐秒刷新，所以每秒都在重建 DOM —— 内容一模一样时直接跳过，
 * 避免每秒无谓地重排整条状态栏。
 */
let lastHeroStatsKey = '';

function buildHeroStats(phaseId, now) {
    const box = document.getElementById('heroStats');
    if (!box) return;

    const pills = [];
    if (phaseId === 'final') {
        const firstStart = getPhaseDates('final').start;
        const state = now < firstStart ? '备考中' : (now <= getPhaseDates('final').end ? '高考进行中' : '已完成');
        pills.push({ cls: 'accent', html: '<span class="dt pulse"></span>' + state });

        // 距下一场尚未开考的考试。
        // 注意 examDates 里只有 {start, end}，没有 name，
        // 科目名要在 exams 里按下标取（曾在此写出 undefined）。
        let nextIdx = -1;
        examDates.forEach((ex, i) => { if (nextIdx < 0 && ex.start > now) nextIdx = i; });
        if (nextIdx >= 0) {
            const dd = Math.max(0, Math.floor((examDates[nextIdx].start - now) / MS_DAY));
            pills.push({ cls: '', text: `下一场 ${exams[nextIdx].name} · ${dd} 天后` });
        } else {
            pills.push({ cls: '', text: '所有场次已结束 · 金榜题名' });
        }

        // 已完成场次 / 总场次
        let done = 0;
        examDates.forEach(ex => { if (ex.end <= now) done += 1; });
        pills.push({ cls: '', text: `已完成 ${done} / ${examDates.length} 场` });
    } else {
        const status = getPhaseStatus(phaseId);
        const stateText = status === 'ongoing' ? '进行中' : status === 'done' ? '已结束' : '即将开始';
        pills.push({ cls: 'accent', html: '<span class="dt pulse"></span>' + stateText });
        // 距下一场（尚未开始的阶段）。刻意不再输出「共 N 个阶段」——
        // 那是实现细节，对考生没有信息量。
        const nextPhaseId = PHASE_ORDER.find(id => getPhaseDates(id).start > now);
        if (nextPhaseId) {
            const cfg = PHASE_CONFIG[nextPhaseId];
            const dd = Math.max(0, Math.floor((getPhaseDates(nextPhaseId).start - now) / MS_DAY));
            pills.push({ cls: '', text: `距${cfg.name} ${dd} 天` });
        }
    }

    const key = pills.map(p => p.text || p.html).join('|');
    if (key === lastHeroStatsKey) return;
    lastHeroStatsKey = key;

    box.innerHTML = pills.map(p =>
        `<span class="pill ${p.cls}">${p.html || p.text}</span>`).join('');
}

/**
 * 阶段专有内容写进 Hero（名称 + 状态徽章）。
 *
 * 原先这里还维护一张独立的「阶段详情」卡片，里面有自己的一整套
 * 天/时/分/秒方块 —— 而 Hero 已经在数同一件事，于是非高考阶段
 * 页面上并排出现两个一模一样的倒计时（实测都是 205 天 11 时 38 分 03 秒）。
 * 现在只保留 Hero 一处倒计时，这张卡片已从 HTML 中移除；
 * 阶段名与状态作为 Hero 内的补充信息，不再是第二个倒计时。
 */
function updatePhaseDetail() {
    const cfg = PHASE_CONFIG[activePhaseId];
    const status = getPhaseStatus(activePhaseId);

    setText(document.getElementById('heroPhaseName'), cfg.longName || cfg.name);

    const badge = document.getElementById('heroPhaseBadge');
    if (badge) {
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
    }
    // 脉冲动画由 CSS 类驱动
    const hero = dom.heroSection;
    if (hero) hero.classList.toggle('ongoing', status === 'ongoing');
}

// ---- 自定义日历选择器 ----
// calState 同时承载两个概念，必须分开：
//   sel*  —— 已提交的选中日期（画橙色色块的唯一依据）
//   year/month/day —— 浏览中的游标（翻月与键盘方向键在动它）
// 早先只有一套字段，goMonth() 又把 day 重置成 1，于是「只是翻到另一个月」
// 就会把那个月的 1 号画成选中态，误导用户以为已经选了日期。
let calState = null;

function openCalendar(trigger) {
    closeCalendar();
    const year = parseInt(trigger.dataset.year);
    const month = parseInt(trigger.dataset.month);
    const day = parseInt(trigger.dataset.day) || 1;
    calState = { trigger, year, month, day,
                 selYear: year, selMonth: month, selDay: day };
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
    renderCalendar(year, month);
    positionCalendar(trigger);
    const popup = document.getElementById('calPopup');
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    focusSelectedDay();
}

function closeCalendar() {
    if (calState) {
        calState.trigger.classList.remove('active');
        calState.trigger.setAttribute('aria-expanded', 'false');
        calState = null;
    }
    const popup = document.getElementById('calPopup');
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
}

/** 把焦点移到当前选中的日期格，便于键盘操作 */
function focusSelectedDay() {
    // 优先聚焦已选日期；翻到别的月份时它不在本视图，退化为聚焦今天所在格，
    // 再退化为当月第一格 —— 键盘用户始终有落点。
    const sel = document.querySelector('#calDays .cal-day.selected')
        || document.querySelector('#calDays .cal-day.today')
        || document.querySelector('#calDays .cal-day:not(.other-month)');
    if (sel) sel.focus();
}

function positionCalendar(trigger) {
    const rect = trigger.getBoundingClientRect();
    const popup = document.getElementById('calPopup');
    const pw = popup.offsetWidth || 272;
    const ph = popup.offsetHeight || 300;
    let top = rect.bottom + 6;
    let left = rect.left;

    if (left + pw > window.innerWidth) {
        left = window.innerWidth - pw;
    }
    if (top + ph > window.innerHeight) {
        top = rect.top - ph;
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

    // 统一补零比较，避免依赖「数字未补零」的巧合
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    // 选中态只看已提交的 sel*，与当前浏览的月份无关：
    // 翻到别的月份时不该有任何一格被画成选中。
    const selYear = calState ? calState.selYear : year;
    const selMonth = calState ? calState.selMonth : month;
    const selDay = calState ? calState.selDay : 1;
    const selStr = `${selYear}-${pad2(selMonth)}-${pad2(selDay)}`;

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
        btn.type = 'button';
        btn.className = 'cal-day';
        btn.textContent = cell.day;
        if (cell.other) btn.classList.add('other-month');

        const dStr = `${year}-${pad2(month)}-${pad2(cell.day)}`;
        if (dStr === todayStr) btn.classList.add('today');
        if (!cell.other && dStr === selStr) btn.classList.add('selected');

        btn.setAttribute('aria-label', `${year}年${month}月${cell.day}日`);
        if (dStr === todayStr) btn.setAttribute('aria-current', 'date');
        if (!cell.other && dStr === selStr) btn.setAttribute('aria-pressed', 'true');

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
    // 提交选中：只有真正点了某一天，sel* 才前进
    calState.selYear = year;
    calState.selMonth = month;
    calState.selDay = day;
    setText(trigger.querySelector('.dp-value'), `${year}年${month}月${day}日`);
    const focusTarget = trigger;
    closeCalendar();
    if (focusTarget && focusTarget.focus) focusTarget.focus();
}

function goMonth(delta) {
    if (!calState) return;
    // 先按自然月推进，再分别处理跨年（原实现用 if/else 链，易漏分支）
    const total = calState.year * 12 + (calState.month - 1) + delta;
    const newYear = Math.floor(total / 12);
    const newMonth = (total % 12 + 12) % 12 + 1;

    calState.year = newYear;
    calState.month = newMonth;
    // 刻意不重置 calState.day：
    // 1) 翻月只是「浏览」，不应改动已提交的选中日期（sel* 保持不变）；
    // 2) day 同时是键盘游标，重置成 1 会让方向键跳回月初。
    // 于是「翻到 2026/6」不会再凭空把 6 月 1 日画成选中。
    renderCalendar(calState.year, calState.month);
    positionCalendar(calState.trigger);
    focusSelectedDay();
}

/** 日历弹窗内的键盘导航：方向键移动、Enter/Space 确认、Esc 关闭 */
function handleCalendarKeydown(e) {
    if (!calState) return;

    if (e.key === 'Escape') {
        const t = calState.trigger;
        closeCalendar();
        if (t && t.focus) t.focus();
        return;
    }

    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();

    // 以北京时间基准做整日推进，避免本地时区/夏令时干扰
    const base = bjDate(calState.year, calState.month, calState.day);
    const moved = addDays(base, delta);
    const t = new Date(moved.getTime() + CN_OFFSET_MIN * 60000);

    calState.year = t.getUTCFullYear();
    calState.month = t.getUTCMonth() + 1;
    calState.day = t.getUTCDate();
    renderCalendar(calState.year, calState.month);
    focusSelectedDay();
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

    // 键盘可达：Enter / Space / 方向键打开日历
    document.getElementById('settingsForm').addEventListener('keydown', (e) => {
        const trigger = e.target.closest('.dp-trigger');
        if (!trigger) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (calState && calState.trigger === trigger) closeCalendar();
            else openCalendar(trigger);
        }
    });

    document.getElementById('calPopup').addEventListener('keydown', handleCalendarKeydown);

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
        // 一律展示「当前生效」的日期（默认或用户覆盖），避免改了没用／显示不一致
        const { start, end } = getPhaseDates(id);
        const t = (d) => new Date(d.getTime() + CN_OFFSET_MIN * 60000);
        const sy = t(start).getUTCFullYear(), sm = t(start).getUTCMonth() + 1, sd = t(start).getUTCDate();
        const ey = t(end).getUTCFullYear(), em = t(end).getUTCMonth() + 1, ed = t(end).getUTCDate();

        const fmt = (y, m, d) => `${y}年${m}月${d}日`;

        const div = document.createElement('div');
        div.className = 'sm-phase';
        div.innerHTML = `
            <div class="sm-phase-name">${cfg.name}${id === 'final' ? '<span class="sm-note">· 与科目日程联动</span>' : ''}</div>
            <div class="sm-date-row" style="margin-bottom:6px;">
                <div class="dp-trigger" data-phase="${id}" data-type="start" role="button"
                     aria-haspopup="dialog" aria-expanded="false"
                     data-year="${sy}" data-month="${sm}" data-day="${sd}" tabindex="0">
                    <span class="dp-label">开始</span>
                    <span class="dp-value">${fmt(sy, sm, sd)}</span>
                    <span class="dp-arrow" aria-hidden="true">▾</span>
                </div>
            </div>
            <div class="sm-date-row">
                <div class="dp-trigger" data-phase="${id}" data-type="end" role="button"
                     aria-haspopup="dialog" aria-expanded="false"
                     data-year="${ey}" data-month="${em}" data-day="${ed}" tabindex="0">
                    <span class="dp-label">结束</span>
                    <span class="dp-value">${fmt(ey, em, ed)}</span>
                    <span class="dp-arrow" aria-hidden="true">▾</span>
                </div>
            </div>
        `;
        form.appendChild(div);
    });

    const resetDiv = document.createElement('div');
    resetDiv.style.cssText = 'text-align:center;margin-top:14px;';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sm-reset-btn';
    resetBtn.id = 'settingsReset';
    resetBtn.textContent = '↻ 恢复默认';
    // 直接绑定，不再依赖事件委托（原实现会在重建 DOM 后变得脆弱）
    resetBtn.addEventListener('click', resetSettings);
    resetDiv.appendChild(resetBtn);
    form.appendChild(resetDiv);
}

// ---- 弹窗焦点管理 ----
let lastFocusedBeforeModal = null;

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(e) {
    if (e.key === 'Escape') { closeSettings(); return; }
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('settingsModal');
    const items = Array.from(modal.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
    }
}

function openSettings() {
    lastFocusedBeforeModal = document.activeElement;
    renderSettingsForm();
    const modal = document.getElementById('settingsModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll(true);
    const first = modal.querySelector(FOCUSABLE);
    if (first) first.focus();
    document.addEventListener('keydown', trapFocus);
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    document.removeEventListener('keydown', trapFocus);
    if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus) {
        lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
}

function saveSettings() {
    const newOverrides = {};
    document.querySelectorAll('.dp-trigger[data-type="start"]').forEach(el => {
        const pid = el.dataset.phase;
        const endEl = document.querySelector(`.dp-trigger[data-type="end"][data-phase="${pid}"]`);
        if (!endEl) return;
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
    // 高考日期可能已变化 → 科目时间跟随平移
    examDates = computeExamDates();
    assertPhaseOrder();

    document.getElementById('phaseNav').innerHTML = '';
    initPhaseNav();
    switchPhase(activePhaseId);
    updateAll(true);
}

function resetSettings() {
    phaseOverrides = {};
    savePhaseSettings();
    renderSettingsForm();
    // 立即生效，不再要求用户额外点一次「保存」
    refreshPhaseUI();
}

// ---- 绑定设置事件 ----
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsCancel').addEventListener('click', closeSettings);
document.getElementById('settingsSave').addEventListener('click', saveSettings);
document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
});

// ---- 版本号单一来源 ----
setText(document.getElementById('versionLabel'), APP_VERSION);

// ---- v2.0.0 初始化 ----
initPhaseNav();
initCalendar();
assertPhaseOrder();
switchPhase('final');
updatePhaseHero();

// ---- Service Worker 注册（带新版本提示） ----
// 版本号作为查询串传给 sw.js，使其缓存名随版本变化，
// 从而在部署新版本后自动触发更新（不再需要手工改缓存名）。
//
// 仅在 http/https 下注册：file:// 打开时浏览器把页面视为非安全上下文，
// register() 必然失败（SecurityError / NotSupportedError）。
// 之前只在 .catch 里吞掉异常，会在控制台留下刺眼的红色报错，
// 且带 URL 查询串的 sw.js 在 file:// 下更易被当成缺失文件。
(function tryRegisterServiceWorker() {
    // 先看协议：file:// 直接跳过，连 navigator.serviceWorker 都不去碰
    // （部分浏览器在 file:// 下读取该属性本身就会抛 SecurityError）
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    if (!isHttp) {
        console.info('[gaokao] 当前以 file:// 打开，已跳过 Service Worker 注册。' +
            '离线缓存与「安装到桌面」需通过 http/https 访问；' +
            '本地预览可在 gaokao 的上级目录执行 python -m http.server 8080。');
        return;
    }

    try {
        if (!('serviceWorker' in navigator) || window.isSecureContext === false) return;

        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`)
                .then((reg) => {
                    const watch = (worker) => {
                        if (!worker) return;
                        worker.addEventListener('statechange', () => {
                            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateHint();
                            }
                        });
                    };
                    if (reg.waiting) watch(reg.waiting);
                    reg.addEventListener('updatefound', () => watch(reg.installing));
                })
                .catch((e) => console.warn('[gaokao] Service Worker 注册失败:', e));
        });
    } catch (e) {
        console.info('[gaokao] 当前环境不支持 Service Worker，已跳过:', e && e.name);
    }
})();

function showUpdateHint() {
    if (document.getElementById('swUpdateBar')) return;
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.id = 'swUpdateBar';
    bar.className = 'sw-update-bar';
    bar.setAttribute('role', 'status');
    bar.textContent = '有新版本可用，点击刷新';
    bar.addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
}

// ============================================================
//  v2.2.0 · 节假日日历
//  ------------------------------------------------------------
//  数据：内置兜底表在 time.js（HOLIDAY_FALLBACK），
//  启动后异步 fetch('./data/holidays.json') 覆盖；失败静默保留兜底。
//  这样页面任何时刻都有数据，网络只是「可能更新一点」。
//  刻意不运行时请求第三方 API：法定节假日一年一变，
//  引入运行时网络依赖会带来可用性耦合、CORS、离线失效与隐私成本。
// ============================================================

const holidayModal = document.getElementById('holidayModal');
let hmState = { year: 0, month: 0 };
let lastFocusedBeforeHoliday = null;

/** 北京时间下的「今天」年月日 */
function bjToday() {
    const t = new Date(Date.now() + CN_OFFSET_MIN * 60000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * 选出「当前正在放的假期」或「下一个假期」。
 * 弹窗与首页卡片共用这一份逻辑，杜绝两处各算一遍导致文案不一致。
 */
function pickHolidayTarget() {
    const today = bjToday();
    const todayNum = cnDayNumber(bjDate(today.y, today.m, today.d));
    let active = null, next = null;
    getHolidayRuns().forEach(r => {
        const s = r.startKey.split('-').map(Number);
        const e = r.endKey.split('-').map(Number);
        const sNum = cnDayNumber(bjDate(s[0], s[1], s[2]));
        const eNum = cnDayNumber(bjDate(e[0], e[1], e[2]));
        if (todayNum >= sNum && todayNum <= eNum) active = { r: r, left: eNum - todayNum };
        if (sNum > todayNum && !next) next = { r: r, inDays: sNum - todayNum };
    });
    return { todayNum: todayNum, active: active, next: next };
}

/** 假期区间文案，如「10月1日 – 10月5日 · 共 7 天」 */
function holidayRangeText(r) {
    const s1 = Number(r.startKey.slice(5, 7)), d1 = Number(r.startKey.slice(8, 10));
    const e1 = Number(r.endKey.slice(5, 7)), d2 = Number(r.endKey.slice(8, 10));
    return s1 + ' 月 ' + d1 + ' 日 – ' + e1 + ' 月 ' + d2 + ' 日 · 共 ' + r.days + ' 天';
}

/** 假期名称文案（含「假期中」与「预估」后缀） */
function holidayNameText(r, inHoliday) {
    return r.name + (inHoliday ? ' · 假期中' : '') + (r.confirmed ? '' : '（预估）');
}

/**
 * 把当前假期情况同时落到「首页常驻卡」与「弹窗」。
 * 两处 ID 各自独立（nh* / hmNext*），所以可以直接双写，不需要克隆 DOM。
 */
function applyHolidayCard(pick) {
    const active = pick.active, next = pick.next;
    const target = active || next;
    const inHoliday = !!active;

    // 命名的三处目标：左栏假期卡 / 右栏日历卡 / 速览弹窗
    const NAMED = [
        { name: 'nhName', meta: 'nhMeta', days: 'nhDays', unit: 'nhUnit' },
        { name: 'nhcName', meta: 'nhcMeta', days: 'nhcDays', unit: 'nhcUnit' },
        { name: 'hmNextName', meta: 'hmNextMeta', days: 'hmNextDays', unit: 'hmNextUnit' }
    ];

    if (!target) {
        NAMED.forEach(t => {
            setText(document.getElementById(t.name), '暂无后续假期安排');
            setText(document.getElementById(t.meta), '待国务院办公厅发布次年安排');
            setText(document.getElementById(t.days), '--');
            setText(document.getElementById(t.unit), '');
        });
        fillHolidayStrip(null);
        return;
    }

    const r = target.r;
    const daysText = String(inHoliday ? active.left : next.inDays);
    const unitText = inHoliday ? '天后结束' : '天';
    NAMED.forEach(t => {
        setText(document.getElementById(t.name), holidayNameText(r, inHoliday));
        setText(document.getElementById(t.meta), holidayRangeText(r));
        setText(document.getElementById(t.days), daysText);
        setText(document.getElementById(t.unit), unitText);
    });

    // 只有左栏卡片有进度方段（其余两处用文字/月历表达进度，不需要重复）
    fillHolidayStrip(active ? { days: r.days, on: r.days - active.left } : null);
}

/** 假期进度方段：等分小方块，已过为实色、未过为浅色 */
function fillHolidayStrip(info) {
    const strip = document.getElementById('nhStrip');
    if (!strip) return;
    if (!info) { strip.innerHTML = ''; return; }
    strip.innerHTML = Array.from({ length: info.days })
        .map((_, i) => `<i class="${i < info.on ? 'on' : ''}"></i>`).join('');
}

function renderHoliday() {
    if (!holidayModal) return;
    const today = bjToday();
    const todayK = holidayKey(today.y, today.m, today.d);
    const todayNum = cnDayNumber(bjDate(today.y, today.m, today.d));

    // ---- 页眉右端的「今天 x/x」 ----
    setText(document.getElementById('calTodayNote'),
        '今天 ' + pad2(today.m) + '/' + pad2(today.d));

    // ---- 下一个假期（三处目标共用同一份计算结果） ----
    applyHolidayCard(pickHolidayTarget());

    renderHolidayCalendar(todayK, todayNum);
    renderUpcomingHolidays(todayNum);
}

/**
 * 速览弹窗的时间线：列出今天之后最近的几个假期段。
 * 与月历分工不同 —— 月历回答「这个月怎么放」，
 * 这里回答「接下来还有哪些假、各休几天」。
 */
function renderUpcomingHolidays(todayNum) {
    const box = document.getElementById('hmUpcoming');
    if (!box) return;
    const runs = getHolidayRuns()
        .map(r => {
            const p = r.startKey.split('-').map(Number);
            const sNum = cnDayNumber(bjDate(p[0], p[1], p[2]));
            return { r: r, sNum: sNum, inDays: sNum - todayNum };
        })
        .filter(x => x.inDays >= 0)
        .sort((a, b) => a.sNum - b.sNum)
        .slice(0, 6);

    if (!runs.length) {
        box.innerHTML = '<div class="hm-item"><span class="hm-item-name" ' +
            'style="color:var(--text-3)">暂无后续假期安排</span></div>';
        return;
    }
    box.innerHTML = runs.map(x => {
        const when = x.inDays === 0 ? '今天开始'
            : x.inDays + ' 天后';
        return '<div class="hm-item' + (x.r.confirmed ? '' : ' is-tent') + '">' +
            '<span class="hm-item-date">' + x.r.startKey.slice(5) + '</span>' +
            '<span class="hm-item-name">' + x.r.name +
            (x.r.confirmed ? '' : '<span class="hm-item-tag">预估</span>') + '</span>' +
            '<span class="hm-item-when">' + x.r.days + ' 天 · ' + when + '</span>' +
            '</div>';
    }).join('');
}

/**
 * 渲染月历：月份标签 / 月历网格 / 当月清单。
 * 只依赖 #hmTabs / #hmGrid / #hmList 三个 id，与「下一个假期」完全解耦。
 */
function renderHolidayCalendar(todayK, todayNum) {
    const months = holidayMonths();
    if (!hmState.year) { hmState.year = months[0].y; hmState.month = months[0].m; }
    const tabs = document.getElementById('hmTabs');
    tabs.innerHTML = '';
    months.forEach(ym => {
        const holi = getMonthHolidays(ym.y, ym.m).filter(x => x.kind === 'holiday').length;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hm-tab';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected',
            String(ym.y === hmState.year && ym.m === hmState.month));
        b.innerHTML = ym.y + '/' + ym.m +
            (holi ? '<span class="cnt">· ' + holi + ' 天</span>' : '');
        b.addEventListener('click', () => {
            hmState.year = ym.y; hmState.month = ym.m;
            renderHolidayCalendar(todayK, todayNum);
        });
        tabs.appendChild(b);
    });

    // ---- 月历网格 ----
    const grid = document.getElementById('hmGrid');
    grid.innerHTML = '';
    ['一', '二', '三', '四', '五', '六', '日'].forEach((w, i) => {
        const s = document.createElement('div');
        s.className = 'hm-wd' + (i >= 5 ? ' we' : '');
        s.textContent = w;
        grid.appendChild(s);
    });

    const y = hmState.year, m = hmState.month;
    const ft = new Date(bjDate(y, m, 1).getTime() + CN_OFFSET_MIN * 60000);
    let offset = ft.getUTCDay() - 1;
    if (offset < 0) offset = 6;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();

    const cells = [];
    for (let i = offset - 1; i >= 0; i--) cells.push({ d: prevDays - i, out: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ d: d, out: false });
    while (cells.length % 7 !== 0) {
        cells.push({ d: cells.length - offset - daysInMonth + 1, out: true });
    }

    cells.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'hm-day';
        const dowIdx = (ft.getUTCDay() + (c.out ? 0 : c.d - 1)) % 7;
        if (dowIdx === 0 || dowIdx === 6) cell.classList.add('we');
        if (c.out) cell.classList.add('out');

        const key = holidayKey(y, m, c.d);
        const h = c.out ? null : getHoliday(key);
        if (h) {
            const tentative = h.kind === 'tentative' || h.confirmed === false;
            if (h.kind === 'workday') cell.classList.add('workday');
            else if (tentative) cell.classList.add('tentative');
            else cell.classList.add('holiday');
            cell.title = h.name + (tentative ? '（预估，以官方公布为准）' : '');
        }
        if (!c.out && key === todayK) cell.classList.add('today');

        // ---- 农历与节气 ----
        // 相邻月份的补格用真实日期算，否则农历会串到别的月
        const cellMonth = c.out
            ? (c.d > 15 ? m - 1 : m + 1)
            : m;
        const cellDate = bjDate(y, cellMonth, c.d, 0, 0);
        const lunar = getLunar(cellDate);
        const term = getSolarTerm(cellDate);

        // 假期名只在首日或名称变化时显示，避免连续多天重复同一个词
        let label = '';
        if (h) {
            if (h.kind === 'workday') label = '班';
            else {
                const prev = getHoliday(holidayKey(y, m, c.d - 1));
                if (!prev || prev.name !== h.name) label = h.name;
            }
        }

        // 一格最多三行小字：假期名 / 节气 / 农历。
        // 都是辅助信息，用同一套 0.56rem 小字，不抢日号的主体地位。
        let extra = '';
        if (term) extra += '<span class="hm-term">' + term.name + '</span>';
        if (lunar) extra += '<span class="hm-lu" aria-hidden="true">' + lunar.label + '</span>';

        cell.innerHTML = '<span class="hm-n">' + c.d + '</span>' +
            (label ? '<span class="hm-lb">' + label + '</span>' : '') +
            extra;
        cell.setAttribute('role', 'gridcell');

        // 读屏用的完整说法：公历 + 农历 + 节气 + 假期
        const parts = [y + ' 年 ' + m + ' 月 ' + c.d + ' 日'];
        if (lunar) parts.push('农历' + lunar.monthName + lunar.dayName);
        if (term) parts.push(term.name + (term.time ? ' ' + term.time : ''));
        if (h) parts.push(h.name);
        cell.setAttribute('aria-label', parts.join('，'));

        grid.appendChild(cell);
    });

    // ---- 当月清单 ----
    const list = document.getElementById('hmList');
    list.innerHTML = '';
    const items = getMonthHolidays(y, m);
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'hm-item';
        empty.innerHTML = '<span class="hm-item-name" style="color:var(--text-3)">本月无法定假日</span>';
        list.appendChild(empty);
    }
    items.forEach(h => {
        const row = document.createElement('div');
        const hy = Number(h.date.slice(0, 4)),
              hmm = Number(h.date.slice(5, 7)),
              hd = Number(h.date.slice(8, 10));
        const diff = cnDayNumber(bjDate(hy, hmm, hd)) - todayNum;
        const when = diff === 0 ? '今天' : diff > 0 ? diff + ' 天后' : '已过';
        const tentative = h.kind === 'tentative' || h.confirmed === false;
        row.className = 'hm-item' + (tentative ? ' is-tent' : '');
        row.innerHTML =
            '<span class="hm-item-date">' + pad2(hmm) + '/' + pad2(hd) + '</span>' +
            '<span class="hm-item-name">' + h.name + '</span>' +
            (tentative ? '<span class="hm-item-tag">预估</span>' : '') +
            (h.kind === 'workday' ? '<span class="hm-item-tag">调休</span>' : '') +
            '<span class="hm-item-when">' + when + '</span>';
        list.appendChild(row);
    });
}

/**
 * 需要展示的月份。
 *
 * 原先的做法是「当月 + 之后两个月」再补「之后最早有安排的三个月」，
 * 而补的那部分只含有假期的月份 —— 于是 2027/3 被跳过，
 * 标签呈现为 10、11、12、1、2、4，用户读到的就是「3 月被吃了」。
 *
 * 现在改为**连续区间**：从当月起连续 7 个月；若这 7 个月里就有假期，
 * 且下一个有安排的月份落在其后 6 个月内，就把区间顺延到覆盖它。
 * 于是既不会漏月，也不会拉成一长条（上限 13 个月）。
 */
function holidayMonths() {
    const today = bjToday();
    const startScore = today.y * 12 + (today.m - 1);
    let endScore = startScore + 6;                    // 连续 7 个月

    const holidayScores = holidayTable.days
        .map(d => Number(d.date.slice(0, 4)) * 12 + (Number(d.date.slice(5, 7)) - 1))
        .filter(s => s >= startScore)
        .sort((a, b) => a - b);

    // 区间内是否已经有假期；有则顺延到「下一个有安排的月份」
    const hasHolidayInside = holidayScores.some(s => s <= endScore);
    if (hasHolidayInside) {
        const nextOutside = holidayScores.find(s => s > endScore);
        if (nextOutside !== undefined && nextOutside <= endScore + 6) {
            endScore = Math.min(nextOutside, startScore + 12);
        }
    }

    const list = [];
    for (let s = startScore; s <= endScore; s++) {
        list.push({ y: Math.floor(s / 12), m: (s % 12) + 1 });
    }
    return list;
}

/** 异步覆盖数据：成功则重渲染，失败静默 */
function loadHolidayData() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    fetch('./data/holidays.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
            if (data && setHolidayData(data)) renderHoliday();
        })
        .catch(() => { /* 静默：保留内置兜底数据 */ });
}

/**
 * 异步覆盖节气数据：成功则重渲染日历，失败静默。
 *
 * 与 loadHolidayData 同一套策略：lunar.js 里有一份同内容的兜底表，
 * 任何时刻都能画出节气；网络只负责「可能更新一点」。
 * 放在 gaokao.js 而不是 lunar.js：lunar.js 是纯函数模块，
 * 不发起请求，便于单独验证。
 */
function loadSolarTermsData() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    fetch(solarTermsDataUrl(), { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
            if (data && setSolarTermsData(data)) {
                // 节气只影响月历格子，重画当前月即可
                renderHolidayCalendar(
                    holidayKey(bjToday().y, bjToday().m, bjToday().d),
                    cnDayNumber(bjDate(bjToday().y, bjToday().m, bjToday().d)));
            }
        })
        .catch(() => { /* 静默：保留内置兜底数据 */ });
}

function openHoliday() {
    if (!holidayModal) return;
    lastFocusedBeforeHoliday = document.activeElement;
    renderHoliday();
    holidayModal.classList.add('open');
    holidayModal.setAttribute('aria-hidden', 'false');
    lockScroll(true);
    const btn = document.getElementById('holidayClose');
    if (btn) btn.focus();
}

function closeHoliday() {
    if (!holidayModal || !holidayModal.classList.contains('open')) return;
    holidayModal.classList.remove('open');
    holidayModal.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    if (lastFocusedBeforeHoliday && lastFocusedBeforeHoliday.focus) {
        lastFocusedBeforeHoliday.focus();
    }
    lastFocusedBeforeHoliday = null;
}

(function initHoliday() {
    const btn = document.getElementById('holidayBtn');
    if (btn) btn.addEventListener('click', openHoliday);
    // 首页「下一个假期」卡片里的「日历 ›」也走同一个弹窗
    const cardBtn = document.getElementById('holidayCardBtn');
    if (cardBtn) cardBtn.addEventListener('click', openHoliday);
    const close = document.getElementById('holidayClose');
    if (close) close.addEventListener('click', closeHoliday);
    if (holidayModal) {
        holidayModal.addEventListener('click', (e) => {
            if (e.target === holidayModal) closeHoliday();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && holidayModal.classList.contains('open')) {
            e.stopPropagation();
            closeHoliday();
        }
    });
    loadHolidayData();
    loadSolarTermsData();
})();

// ------------------------------------------------------------
// 首屏主题落地
// 放在文件末尾而不是主题段落里：applyTheme() 内部会视情况调用
// updateFullscreen() / updatePipContent()，而 fsOverlay、pipWindow
// 的声明在本文件中位于主题段落之后。放在末尾可确保此时
// 所有 const/let 都已初始化，不再依赖 typeof 守卫。
// ------------------------------------------------------------
applyTheme();

// ------------------------------------------------------------
// 首屏节假日落地
// v2.3.0 起「下一个假期」是首页左栏的常驻卡片，
// 不再等到用户点开弹窗才有内容 —— 所以启动时就要渲染一次。
// renderHoliday() 内部会同时写首页卡片与弹窗，两处永远一致。
// ------------------------------------------------------------
try {
    renderHoliday();
} catch (err) {
    // 节假日只是附加信息，渲染失败不应影响倒计时主功能
    console.warn('[gaokao] 首页假期卡渲染失败：', err && err.message);
}
