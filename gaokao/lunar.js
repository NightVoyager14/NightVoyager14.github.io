// ============================================================
//  农历与二十四节气
//  ------------------------------------------------------------
//  纯函数模块，不碰 DOM，也不改动 time.js 的既有数据结构。
//
//  农历算法：
//    1) 以天文近似式算出每个「朔」（新月）的北京日期，见 NEW_MOON_DAYS；
//    2) 按中国历法规则编号 —— **包含冬至的那个朔望月为十一月**，
//       其后依次递增、逢 12 归 1；
//    3) 日序 = 北京日期距该月月首的天数。
//  已用「2026 年二十四节气表」里的 24 个农历日期逐条校验，24/24 一致。
//
//  节气数据：
//    2026 年为**官方权威值**（精确到分）；2027 年 1-2 月沿用官方表；
//    其余年份由近似式推算，**只显示日期、不显示时刻**。
// ============================================================

/**
 * 距 2000-01-01 的天数（北京时间日历天）。
 *
 * 注意口径：time.js 的 cnDayNumber() 返回的是**距 1970-01-01** 的天数，
 * 而本模块的朔表是 2000 基（更好读、数字更小）。两者相差 LUNAR_EPOCH_DAY。
 * 早先这里直接照搬了 cnDayNumber 的口径，于是查表全部落空、
 * getLunar() 一律返回 null —— 是本节最容易再次踩到的坑。
 */
const LUNAR_EPOCH_DAY = 10957;   // 1970-01-01 → 2000-01-01

function lunarEpochDay(date) {
    const t = new Date(date.getTime() + CN_OFFSET_MIN * 60000);
    const daysFromUnix = Math.floor(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) / MS_DAY);
    return daysFromUnix - LUNAR_EPOCH_DAY;
}

/** 由「距 2000-01-01 的天数」还原该日的北京时间 0 点 */
function lunarDateFromDayNumber(n) {
    return bjDate(2000, 1, 1 + n, 0, 0);
}

/**
 * 朔（新月）表：距 2000-01-01 的北京日历天，覆盖约 2024-02 ~ 2029-12。
 * 由 Meeus 朔望月近似式（含主要摄动项）算出，精度约 ±2 分钟，
 * 远小于「落在哪一天」的边界风险。
 */
const NEW_MOON_DAYS = [
    8923, 8953, 8982, 9012, 9042, 9071, 9101, 9131,
    9160, 9190, 9219, 9249, 9278, 9307, 9337, 9366,
    9396, 9425, 9455, 9485, 9515, 9544, 9574, 9603,
    9633, 9662, 9691, 9721, 9750, 9779, 9809, 9839,
    9869, 9898, 9928, 9958, 9987, 10017, 10046, 10075,
    10105, 10134, 10163, 10193, 10223, 10252, 10282, 10312,
    10342, 10371, 10401, 10430, 10459, 10489, 10518, 10547,
    10577, 10607, 10636, 10666, 10696, 10725, 10755, 10784,
    10814, 10843, 10873, 10902, 10931, 10961, 10991, 11020,
    11050, 11079, 11109, 11139, 11168, 11198, 11227, 11257,
    11286, 11316, 11345, 11374, 11404, 11434, 11463, 11493,
    11522, 11552, 11582, 11611, 11641, 11670, 11700
];

const LUNAR_DAY_NAMES = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

// 月名统一用「十一月」而不是「冬月」：用户提供的节气表写的是「十一月十四」，
// 界面应与之一致。（冬月是民间别称，两者等价；挑一个就好，不要混用。）
const LUNAR_MONTH_NAMES = ['', '正月', '二月', '三月', '四月', '五月', '六月',
                           '七月', '八月', '九月', '十月', '十一月', '腊月'];

/** 月序 1..12 → 月名（1 为正月，11 为冬月，12 为腊月） */
function lunarMonthName(num) {
    return LUNAR_MONTH_NAMES[num] || '';
}

/** n 所在的朔望月在 NEW_MOON_DAYS 中的下标；-1 表示超出覆盖范围 */
function newMoonIndexFor(n) {
    const last = NEW_MOON_DAYS.length;
    if (n < NEW_MOON_DAYS[0] || n >= NEW_MOON_DAYS[last - 1]) return -1;
    let lo = 0, hi = last - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (NEW_MOON_DAYS[mid] <= n) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/** 某个朔望月是否包含冬至（12 月 21 日） */
function monthContainsSolstice(i) {
    const s = NEW_MOON_DAYS[i];
    const e = NEW_MOON_DAYS[i + 1];
    // 冬至要按月自己所在的年份取：跨年的那个月里，冬至落在「月尾年份」上，
    // 只按起始年取会漏判（这里踩过一次）。
    for (const base of [s, e]) {
        const d = lunarDateFromDayNumber(base);
        const t = new Date(d.getTime() + CN_OFFSET_MIN * 60000);
        const ws = lunarEpochDay(bjDate(t.getUTCFullYear(), 12, 21, 0, 0));
        if (s <= ws && ws < e) return true;
    }
    return false;
}

/**
 * 计算某个月首的月序（1..12）。
 * 规则：包含冬至的那个朔望月 = 十一月，其后依次递增、逢 12 归 1。
 */
function lunarMonthNumber(moonIndex) {
    let num = null;
    for (let i = 0; i <= moonIndex; i++) {
        if (monthContainsSolstice(i)) num = 11;
        else if (num !== null) { num += 1; if (num > 12) num -= 12; }
    }
    return num;
}

/**
 * 取某天的农历信息。
 * 返回 { day, dayName, monthNum, monthName, label }
 *   label —— 适合填进日历格的一行小字：
 *            · 农历月的第一天显示月名（「八月」「正月」）
 *            · 其余显示日名（「廿八」）
 * 超出朔表覆盖范围时返回 null，调用方据此不显示农历。
 */
function getLunar(date) {
    const n = lunarEpochDay(date);
    const idx = newMoonIndexFor(n);
    if (idx < 0) return null;
    const num = lunarMonthNumber(idx);
    if (!num) return null;
    const offset = n - NEW_MOON_DAYS[idx];
    if (offset < 0 || offset > 29) return null;
    const monthName = lunarMonthName(num);
    const dayName = LUNAR_DAY_NAMES[offset];
    if (!dayName) return null;
    return {
        day: offset + 1,
        dayName: dayName,
        monthNum: num,
        monthName: monthName,
        label: offset === 0 ? monthName : dayName
    };
}

// ------------------------------------------------------------
//  二十四节气
// ------------------------------------------------------------

const SOLAR_TERM_NAMES = [
    '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
    '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
    '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

/**
 * 二十四节气 —— 内置兜底表（官方权威值，精确到分）。
 * 键为「月*100+日」，值为 [节气名, 时刻]。
 * 2026 年全量 + 2027 年全量 + 2028 年 1 月。
 *
 * 这份表与 `data/solar-terms.json` 内容相同：
 * 启动后异步 fetch 该文件覆盖本表，失败则静默保留本表 ——
 * 与 `time.js` 的 HOLIDAY_FALLBACK / `data/holidays.json` 是同一套策略：
 * **保证任何时刻都有数据，网络只是「可能更新一点」**。
 *
 * 改任意一年都要同时改两处，并跑 solar_check.py 逐条比对。
 */
const SOLAR_TERMS_FALLBACK = {
    2026: {
        105: ['小寒', '16:23'], 120: ['大寒', '09:45'],
        204: ['立春', '04:02'], 218: ['雨水', '23:52'],
        305: ['惊蛰', '21:59'], 320: ['春分', '22:46'],
        405: ['清明', '02:40'], 420: ['谷雨', '09:39'],
        505: ['立夏', '19:49'], 521: ['小满', '08:37'],
        605: ['芒种', '23:48'], 621: ['夏至', '16:25'],
        707: ['小暑', '09:57'], 723: ['大暑', '03:13'],
        807: ['立秋', '19:43'], 823: ['处暑', '10:19'],
        907: ['白露', '22:41'], 923: ['秋分', '08:05'],
        1008: ['寒露', '14:29'], 1023: ['霜降', '17:38'],
        1107: ['立冬', '17:52'], 1122: ['小雪', '15:23'],
        1207: ['大雪', '10:53'], 1222: ['冬至', '04:50']
    },
    2027: {
        105: ['小寒', '04:21'], 120: ['大寒', '21:47'],
        204: ['立春', '09:46'], 219: ['雨水', '05:33'],
        306: ['惊蛰', '03:39'], 321: ['春分', '04:24'],
        405: ['清明', '08:17'], 420: ['谷雨', '15:17'],
        506: ['立夏', '01:24'], 521: ['小满', '14:17'],
        606: ['芒种', '05:25'], 621: ['夏至', '22:10'],
        707: ['小暑', '15:36'], 723: ['大暑', '09:04'],
        808: ['立秋', '01:26'], 823: ['处暑', '16:13'],
        908: ['白露', '04:28'], 923: ['秋分', '14:01'],
        1008: ['寒露', '20:16'], 1023: ['霜降', '23:32'],
        1107: ['立冬', '23:38'], 1122: ['小雪', '21:15'],
        1207: ['大雪', '16:37'], 1222: ['冬至', '10:41']
    },
    2028: {
        106: ['小寒', '03:52'], 120: ['大寒', '15:29']
    }
};

/** 当前生效的节气表（可被异步加载的 JSON 替换） */
let solarTermTable = SOLAR_TERMS_FALLBACK;

/**
 * 用新数据替换节气表（字段不合法时忽略，保持兜底数据）。
 * 入参形如 { terms: [{ date:'2027-02-04', name:'立春', time:'09:46' }, ...] }
 * 非法输入返回 false，调用方据此决定是否重渲染。
 */
function setSolarTermsData(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.terms)) return false;
    const table = {};
    const ok = data.terms.every(t => {
        if (!t || typeof t.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
            typeof t.name !== 'string' || !t.name) return false;
        const y = Number(t.date.slice(0, 4));
        const key = Number(t.date.slice(5, 7)) * 100 + Number(t.date.slice(8, 10));
        if (!table[y]) table[y] = {};
        table[y][key] = [t.name, typeof t.time === 'string' ? t.time : ''];
        return true;
    });
    if (!ok) {
        console.warn('[gaokao] 节气数据格式不合法，已忽略并保留内置数据');
        return false;
    }
    solarTermTable = table;
    return true;
}

/**
 * 异步覆盖节气数据：成功则返回 true，失败静默。
 * 刻意不在 lunar.js 里直接调用 fetch —— 本模块是纯函数模块，
 * 由 gaokao.js 在启动时调用（与 loadHolidayData 同一位置），
 * 这样「数据获取」这件事集中在 gaokao.js 一处，便于排查。
 */
function solarTermsDataUrl() {
    return './data/solar-terms.json';
}


/**
 * 非权威年份的节气日期（公历 MMDD，只有日期没有时刻）。
 * 由标准近似式推算并逐月校正（该式在 7/8/9/10 月需 +2 天经验修正，
 * 已用 2026 / 2027 两年的官方表比对过）。
 * 官方未发布的年份**只显示日期，不显示时刻** —— 宁可少给信息，
 * 也不给未经核对的分钟数。
 */
const SOLAR_TERM_APPROX = {
    2028: [106, 120, 204, 219, 305, 320, 404, 419, 505, 520, 605, 621,
           706, 722, 807, 822, 907, 922, 1008, 1023, 1107, 1122, 1206, 1221],
    2029: [105, 120, 203, 218, 305, 320, 404, 420, 505, 521, 605, 621,
           707, 722, 807, 823, 907, 923, 1008, 1023, 1107, 1122, 1207, 1221]
};

/**
 * 取某天的节气信息。
 * 返回 { name, time }；time 为空字符串表示该年没有权威时刻。
 * 返回 null 表示这一天不是节气。
 */
function getSolarTerm(date) {
    const t = new Date(date.getTime() + CN_OFFSET_MIN * 60000);
    const y = t.getUTCFullYear();
    const key = (t.getUTCMonth() + 1) * 100 + t.getUTCDate();

    const table = solarTermTable[y];
    if (table && table[key]) return { name: table[key][0], time: table[key][1] };

    const list = SOLAR_TERM_APPROX[y];
    if (list) {
        const i = list.indexOf(key);
        if (i >= 0) return { name: SOLAR_TERM_NAMES[i], time: '' };
    }
    return null;
}

/** 该日是否有节气 */
function hasSolarTerm(date) {
    return !!getSolarTerm(date);
}
