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
                <span class="name">${ex.name}</span>
                <span class="meta">
                    <span class="time-range">${startH}:${startM} – ${endH}:${endM}</span>
                    <span class="tag ${tagClasses[ex.tag]}">${tagLabels[ex.tag]}</span>
                    <span class="dur-note">${durStr}</span>
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
//  主题切换
// ============================================================

const themeToggle = document.getElementById('themeToggle');

function syncThemeButton() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setText(themeToggle, isDark ? '深色 →' : '浅色 →');
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.title = isDark ? '当前深色，点击切换为浅色' : '当前浅色，点击切换为深色';
}

function loadTheme() {
    try {
        const saved = localStorage.getItem('gaokao_theme');
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            syncThemeButton();
            return;
        }
    } catch (_) {}
    document.documentElement.removeAttribute('data-theme');
    syncThemeButton();
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('gaokao_theme', 'light'); } catch (_) {}
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        try { localStorage.setItem('gaokao_theme', 'dark'); } catch (_) {}
    }
    syncThemeButton();
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

    document.getElementById('fsCurLabel').textContent =
        hasCurrent ? '当前考试' : (isVisible ? '下一场' : '高考进程');

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
    } else {
        fsDd.textContent = '—'; fsDh.textContent = '—';
        fsDm.textContent = '—'; fsDs.textContent = '—';
    }

    let nextName = '—', nextTime = '—', nextCountdown = '—';
    for (const ex of exams) {
        if (!isExamRelevant(ex, selectedSubjects)) continue;
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
function initPhaseNav() {
    const nav = document.getElementById('phaseNav');
    if (!nav) return;
    PHASE_ORDER.forEach(id => {
        const cfg = PHASE_CONFIG[id];
        const status = getPhaseStatus(id);
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `phase-tab${status === 'done' ? ' done' : ''}${id === activePhaseId ? ' active' : ''}`;
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

    const isFinal = phaseId === 'final';
    document.getElementById('gaokaoContent').classList.toggle('hidden', !isFinal);
    document.getElementById('phaseDetail').classList.toggle('show', !isFinal);

    updatePhaseHero();
    if (!isFinal) updatePhaseDetail();
    if (fsOverlay.classList.contains('open')) updateFullscreen();
}

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

    // 读屏播报（分钟级变化才更新）
    const a11yKey = `${label}|${dom.hDays.textContent}-${dom.hHours.textContent}-${dom.hMins.textContent}`;
    if (a11yKey !== lastA11yKey) {
        lastA11yKey = a11yKey;
        setText(dom.heroA11y,
            `${dom.heroLabel.textContent} ${dom.hDays.textContent} 天 ` +
            `${dom.hHours.textContent} 小时 ${dom.hMins.textContent} 分`);
    }
}

function updatePhaseDetail() {
    const detail = document.getElementById('phaseDetail');
    if (!detail.classList.contains('show')) return;

    const cfg = PHASE_CONFIG[activePhaseId];
    const { start, end } = getPhaseDates(activePhaseId);
    const status = getPhaseStatus(activePhaseId);
    const now = new Date();

    setText(document.getElementById('pdName'), cfg.longName || cfg.name);

    const startStr = fmtCnFull(start);
    const endStr = fmtCnMonthDay(end);
    setText(document.getElementById('pdDateRange'), `${startStr} - ${endStr}`);

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

    const p = splitDuration(diff);
    setText(document.getElementById('pdDays'), pad2(p.d));
    setText(document.getElementById('pdHours'), pad2(p.h));
    setText(document.getElementById('pdMins'), pad2(p.m));
    setText(document.getElementById('pdSecs'), pad2(p.s));
    setText(document.getElementById('pdDesc'), label);

    // 脉冲动画改由 CSS 类驱动（见 style.css 的 .phase-detail.ongoing）
    detail.classList.toggle('ongoing', status === 'ongoing');
}

// ---- 自定义日历选择器 ----
let calState = null;

function openCalendar(trigger) {
    closeCalendar();
    const year = parseInt(trigger.dataset.year);
    const month = parseInt(trigger.dataset.month);
    const day = parseInt(trigger.dataset.day) || 1;
    calState = { trigger, year, month, day };
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
    const sel = document.querySelector('#calDays .cal-day.selected')
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

    const selYear = calState ? calState.year : year;
    const selMonth = calState ? calState.month : month;
    const selDay = calState ? calState.day : 1;
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
    calState.day = 1;
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
