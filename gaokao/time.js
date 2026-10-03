// ============================================================
//  四川 3+1+2 新高考 · 时间与配置（单一数据源）
//  ------------------------------------------------------------
//  本文件只做「算」和「配」，不碰任何 DOM。
//  所有日期一律以北京时间（UTC+8）为基准构造，与用户所处时区无关。
//  在 index.html 中必须先于 gaokao.js 引入。
// ============================================================

/* 版本号唯一来源：页脚与 Service Worker 缓存名都从这里取。
   改代码时只需改这一处。 */
const APP_VERSION = '2.5.2';

// ------------------------------------------------------------
//  时间基准
// ------------------------------------------------------------

const CN_OFFSET_MIN = 8 * 60;          // 北京时间相对 UTC 的偏移（分钟）
const MS_DAY = 86400000;

/**
 * 按北京时间构造 Date。month 用 1-12 的自然月号。
 * 例：bjDate(2027, 6, 7, 9, 0) → 北京时间 2027-06-07 09:00
 */
function bjDate(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - CN_OFFSET_MIN * 60000);
}

/** 以北京时间格式化日期文案 */
const CN_FMT_FULL = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
});
const CN_FMT_MD = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric',
});

function fmtCnFull(date) { return CN_FMT_FULL.format(date); }
function fmtCnMonthDay(date) { return CN_FMT_MD.format(date); }

/** 取某时刻在北京时间下的「日」序号（用于判定跨天） */
function cnDayKey(date) {
    const t = new Date(date.getTime() + CN_OFFSET_MIN * 60000);
    return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}-${t.getUTCDate()}`;
}

/** 剩余量拆分为 天/时/分/秒（负数钳到 0） */
function splitDuration(ms) {
    const v = Math.max(0, ms);
    return {
        d: Math.floor(v / MS_DAY),
        h: Math.floor((v % MS_DAY) / 3600000),
        m: Math.floor((v % 3600000) / 60000),
        s: Math.floor((v % 60000) / 1000),
    };
}

/** 补零 */
function pad2(n) { return String(n).padStart(2, '0'); }

/** 目标状态机 */
function targetState(now, start, end) {
    if (now < start) return 'waiting';
    if (now <= end) return 'ongoing';
    return 'done';
}

// ------------------------------------------------------------
//  高考年份（每年 6/10 11:00 之后自动推进到下一年）
// ------------------------------------------------------------

const GAOKAO_YEAR = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const end = bjDate(y, 6, 10, 11, 0);
    return now > end ? y + 1 : y;
})();

/** 届数标识（始终显示当前考生所属届） */
const COHORT_LABEL = GAOKAO_YEAR + '届';

// ------------------------------------------------------------
//  考试科目（唯一来源：只配「日 + 时 + 分」，年份由 GAOKAO_YEAR 补齐）
//  高考起止日期也由这里推导，避免两处各写一份。
// ------------------------------------------------------------

const exams = [
    // 6月7日
    { date: 7,  start: [9, 0],   end: [11, 30], name: '语文',            tag: 'mandatory' },
    { date: 7,  start: [15, 0],  end: [17, 0],  name: '数学',            tag: 'mandatory' },
    // 6月8日
    { date: 8,  start: [9, 0],   end: [10, 15], name: '历史 / 物理',     tag: 'elective' },
    { date: 8,  start: [15, 0],  end: [17, 0],  name: '外语',            tag: 'mandatory' },
    // 6月9日
    { date: 9,  start: [8, 30],  end: [9, 45],  name: '化学',            tag: 'elective' },
    { date: 9,  start: [11, 0],  end: [12, 15], name: '地理',            tag: 'elective' },
    { date: 9,  start: [14, 30], end: [15, 45], name: '思想政治',        tag: 'elective' },
    { date: 9,  start: [17, 0],  end: [18, 15], name: '生物学',          tag: 'elective' },
    // 6月10日
    { date: 10, start: [9, 0],   end: [11, 0],  name: '藏语文 / 彝语文', tag: 'special' },
];

const tagLabels = { mandatory: '全国统考', elective: '等级选考', special: '民族加试' };
const tagClasses = { mandatory: 'tag-mandatory', elective: 'tag-elective', special: 'tag-special' };
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

/** 某场考试在给定年份下的起止时刻 */
function examStartAt(ex, year) { return bjDate(year, 6, ex.date, ex.start[0], ex.start[1]); }
function examEndAt(ex, year) { return bjDate(year, 6, ex.date, ex.end[0], ex.end[1]); }

// 高考起止：起点 6/7 00:00，终点 = 最后一场考试的结束时刻
const gaokaoStart = bjDate(GAOKAO_YEAR, 6, 7, 0, 0);
const gaokaoEnd = examEndAt(exams[exams.length - 1], GAOKAO_YEAR);

function getWeekDay(date) {
    const d = bjDate(GAOKAO_YEAR, 6, date);
    return '周' + weekDays[new Date(d.getTime() + CN_OFFSET_MIN * 60000).getUTCDay()];
}

const dateLabels = {};
[7, 8, 9, 10].forEach(d => { dateLabels[d] = `6月${d}日 · ${getWeekDay(d)}`; });

// ------------------------------------------------------------
//  阶段配置（诊断考试 + 高考）
//  高考阶段日期由上面的 gaokaoStart/gaokaoEnd 推导，不再硬编码年份。
// ------------------------------------------------------------

const PHASE_CONFIG = {
    zero: {
        id: 'zero', name: '零诊', longName: '零诊 · 摸底考试', short: '零',
        defaultStart: { year: 2026, month: 7, day: 6 },
        defaultEnd: { year: 2026, month: 7, day: 8 },
        desc: '高三摸底考试',
    },
    first: {
        id: 'first', name: '一诊', longName: '第一次诊断性考试', short: '一',
        defaultStart: { year: 2026, month: 12, day: 21 },
        defaultEnd: { year: 2026, month: 12, day: 23 },
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
        // 与 gaokaoStart / gaokaoEnd 同源，跨年自动跟随 GAOKAO_YEAR
        defaultStart: { year: GAOKAO_YEAR, month: 6, day: 7 },
        defaultEnd: { year: GAOKAO_YEAR, month: 6, day: 10 },
        desc: '全国统一高考',
    },
};

const PHASE_ORDER = ['zero', 'first', 'second', 'third', 'final'];

// ------------------------------------------------------------
//  选科
// ------------------------------------------------------------

const SUBJECTS = {
    primary: { label: '首选', options: ['历史', '物理'], max: 1 },
    secondary: { label: '再选', options: ['化学', '地理', '思想政治', '生物学'], max: 2 },
};
const allSubjects = [...SUBJECTS.primary.options, ...SUBJECTS.secondary.options];

/** 某场考试在给定选科下是否相关（未选科时全部相关） */
function isExamRelevant(ex, selectedSubjects) {
    if (!selectedSubjects || selectedSubjects.length === 0) return true;
    if (ex.tag !== 'elective') return true;
    const parts = ex.name.split('/').map(s => s.trim());
    return parts.some(p => selectedSubjects.includes(p));
}

// ------------------------------------------------------------
//  节假日（v2.2.0）
//  ------------------------------------------------------------
//  设计取舍：不运行时请求第三方 API。
//  原因：法定节假日由国务院办公厅每年发布一次，属「一年一变」的数据；
//  为它引入运行时网络依赖，会带来可用性耦合、CORS 不确定性、
//  离线失效与访客 IP 外泄，收益远不及成本。
//  因此：内置一份数据作为兜底（页面任何时刻都有数据），
//  再由 gaokao.js 尝试 fetch('./data/holidays.json') 覆盖，
//  失败则静默保留内置数据。将来若要接 API，只需替换那一个加载器，
//  UI 与本文件的查询函数都不用动。
//
//  kind: 'holiday' 法定放假 | 'workday' 调休上班 | 'tentative' 日期未公布
//  confirmed: false 表示按农历/惯例预估，界面会标注「预估」
// ------------------------------------------------------------

const HOLIDAY_FALLBACK = {
    schemaVersion: 2,
    days: [
        // ---------- 2026 年（依国办发明电〔2025〕7 号，全部官方） ----------
        { date: '2026-01-01', name: '元旦', kind: 'holiday', confirmed: true },
        { date: '2026-01-02', name: '元旦', kind: 'holiday', confirmed: true },
        { date: '2026-01-03', name: '元旦', kind: 'holiday', confirmed: true },
        { date: '2026-01-04', name: '调休上班', kind: 'workday', confirmed: true },

        { date: '2026-02-15', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-16', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-17', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-18', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-19', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-20', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-21', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-22', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-23', name: '春节', kind: 'holiday', confirmed: true },
        { date: '2026-02-14', name: '调休上班', kind: 'workday', confirmed: true },
        { date: '2026-02-28', name: '调休上班', kind: 'workday', confirmed: true },

        { date: '2026-04-04', name: '清明节', kind: 'holiday', confirmed: true },
        { date: '2026-04-05', name: '清明节', kind: 'holiday', confirmed: true },
        { date: '2026-04-06', name: '清明节', kind: 'holiday', confirmed: true },

        { date: '2026-05-01', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2026-05-02', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2026-05-03', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2026-05-04', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2026-05-05', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2026-05-09', name: '调休上班', kind: 'workday', confirmed: true },

        { date: '2026-06-19', name: '端午节', kind: 'holiday', confirmed: true },
        { date: '2026-06-20', name: '端午节', kind: 'holiday', confirmed: true },
        { date: '2026-06-21', name: '端午节', kind: 'holiday', confirmed: true },

        { date: '2026-09-25', name: '中秋节', kind: 'holiday', confirmed: true },
        { date: '2026-09-26', name: '中秋节', kind: 'holiday', confirmed: true },
        { date: '2026-09-27', name: '中秋节', kind: 'holiday', confirmed: true },
        { date: '2026-09-20', name: '调休上班', kind: 'workday', confirmed: true },

        { date: '2026-10-01', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-02', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-03', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-04', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-05', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-06', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-07', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2026-10-10', name: '调休上班', kind: 'workday', confirmed: true },

        // ---------- 2027 年（官方未公布，按农历与惯例预估） ----------
        { date: '2027-01-01', name: '元旦', kind: 'holiday', confirmed: true },
        { date: '2027-01-02', name: '元旦', kind: 'holiday', confirmed: false },
        { date: '2027-01-03', name: '元旦', kind: 'holiday', confirmed: false },

        { date: '2027-02-05', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-06', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-07', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-08', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-09', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-10', name: '春节', kind: 'holiday', confirmed: false },
        { date: '2027-02-11', name: '春节', kind: 'holiday', confirmed: false },

        { date: '2027-04-04', name: '清明节', kind: 'holiday', confirmed: false },
        { date: '2027-04-05', name: '清明节', kind: 'holiday', confirmed: false },
        { date: '2027-04-06', name: '清明节', kind: 'holiday', confirmed: false },

        { date: '2027-05-01', name: '劳动节', kind: 'holiday', confirmed: true },
        { date: '2027-05-02', name: '劳动节', kind: 'holiday', confirmed: false },
        { date: '2027-05-03', name: '劳动节', kind: 'holiday', confirmed: false },
        { date: '2027-05-04', name: '劳动节', kind: 'holiday', confirmed: false },
        { date: '2027-05-05', name: '劳动节', kind: 'holiday', confirmed: false },

        { date: '2027-06-09', name: '端午节', kind: 'holiday', confirmed: false },
        { date: '2027-06-10', name: '端午节', kind: 'holiday', confirmed: false },
        { date: '2027-06-11', name: '端午节', kind: 'holiday', confirmed: false },

        { date: '2027-09-15', name: '中秋节', kind: 'holiday', confirmed: false },
        { date: '2027-09-16', name: '中秋节', kind: 'holiday', confirmed: false },
        { date: '2027-09-17', name: '中秋节', kind: 'holiday', confirmed: false },

        { date: '2027-10-01', name: '国庆节', kind: 'holiday', confirmed: true },
        { date: '2027-10-02', name: '国庆节', kind: 'holiday', confirmed: false },
        { date: '2027-10-03', name: '国庆节', kind: 'holiday', confirmed: false },
        { date: '2027-10-04', name: '国庆节', kind: 'holiday', confirmed: false },
        { date: '2027-10-05', name: '国庆节', kind: 'holiday', confirmed: false },
        { date: '2027-10-06', name: '国庆节', kind: 'holiday', confirmed: false },
        { date: '2027-10-07', name: '国庆节', kind: 'holiday', confirmed: false }
    ]
};

/** 当前生效的节假日表（可被异步加载的 JSON 替换） */
let holidayTable = HOLIDAY_FALLBACK;

/** 日期键：与 cnDayKey 同一套 UTC+8 规则，保证与倒计时同一天 */
function holidayKey(year, month, day) {
    return year + '-' + pad2(month) + '-' + pad2(day);
}

/** 用新数据替换节假日表（字段不合法时忽略，保持兜底数据） */
function setHolidayData(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.days)) return false;
    const ok = data.days.every(d => d && typeof d.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
        (d.kind === 'holiday' || d.kind === 'workday' || d.kind === 'tentative'));
    if (!ok) {
        console.warn('[gaokao] 节假日数据格式不合法，已忽略并保留内置数据');
        return false;
    }
    holidayTable = data;
    return true;
}

/** 查某一天的节假日记录，没有则返回 null */
function getHoliday(dateKey) {
    for (let i = 0; i < holidayTable.days.length; i++) {
        if (holidayTable.days[i].date === dateKey) return holidayTable.days[i];
    }
    return null;
}

/** 某月的全部节假日记录（按日期升序） */
function getMonthHolidays(year, month) {
    const prefix = year + '-' + pad2(month) + '-';
    return holidayTable.days
        .filter(d => d.date.indexOf(prefix) === 0)
        .sort((a, b) => a.date < b.date ? -1 : 1);
}

/** 把 'YYYY-MM-DD' 解析为北京时间当天 0 点的日序号。
    刻意用日序号而不是字符串比较：
    cnDayKey() 产出的是不补零格式（2026-10-2），
    而数据文件用补零格式（2026-10-02），字符串比较永远不相等。 */
function holidayDateNumber(dateStr) {
    const p = dateStr.split('-').map(Number);
    return cnDayNumber(bjDate(p[0], p[1], p[2]));
}

/**
 * 把同名的连续「放假」日合并成假期段，便于「下一个假期」这类展示。
 * 返回 [{ name, startKey, endKey, days, confirmed }]
 */
function getHolidayRuns() {
    const runs = [];
    let cur = null;
    holidayTable.days
        .filter(d => d.kind === 'holiday')
        .slice()
        .sort((a, b) => holidayDateNumber(a.date) - holidayDateNumber(b.date))
        .forEach(d => {
            const n = holidayDateNumber(d.date);
            const isNext = cur && (n - holidayDateNumber(cur.endKey) === 1);
            if (cur && cur.name === d.name && isNext) {
                cur.endKey = d.date;
                cur.days += 1;
                if (d.confirmed === false) cur.confirmed = false;
            } else {
                cur = {
                    name: d.name, startKey: d.date, endKey: d.date,
                    days: 1, confirmed: d.confirmed !== false
                };
                runs.push(cur);
            }
        });
    return runs;
}

/** 今天（北京时间）的日期键 */
function todayKey() {
    return cnDayKey(new Date());
}
