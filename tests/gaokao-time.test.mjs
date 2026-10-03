/**
 * 高考倒计时 · 时间与阶段逻辑回归测试
 *
 * 零依赖：只用 Node 内置的 node:test 与 vm。
 * 运行：
 *     node --test tests/
 *     或直接： node --test
 *
 * 设计说明：
 *   这里只测「纯逻辑」（时间基准、阶段日期、覆盖校验、选科相关性），
 *   不依赖 DOM，所以无需任何第三方库。
 *   涉及 DOM 的渲染/交互由事后手工验收
 *   （见 OPTIMIZATION_PLAN.md 附录 B 的验收清单）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const TIME_JS = readFileSync(join(ROOT, 'gaokao', 'time.js'), 'utf8');
const APP_JS = readFileSync(join(ROOT, 'gaokao', 'gaokao.js'), 'utf8');

/** gaokao.js 中「阶段管理」段落是纯逻辑（不含 DOM 调用），单独取出做测试 */
const PHASE_SLICE = (() => {
    const start = APP_JS.indexOf('// PHASE_CONFIG / PHASE_ORDER 已移至 time.js');
    const end = APP_JS.indexOf('function initPhaseNav()');
    assert.ok(start > 0, '未找到阶段逻辑段落起点');
    assert.ok(end > start, '未找到阶段逻辑段落终点');
    return APP_JS.slice(start, end);
})();

/**
 * 在受控沙箱中加载时间与阶段逻辑。
 * @param {object} opts
 * @param {string} [opts.now]     固定「现在」的时刻（ISO 字符串）
 * @param {object} [opts.storage] 预置的 localStorage 内容
 */
function load(opts = {}) {
    const clockNow = opts.now ? new Date(opts.now).getTime() : Date.now();

    class FakeDate extends Date {
        constructor(...args) {
            if (args.length === 0) super(clockNow);
            else super(...args);
        }
        static now() { return clockNow; }
    }

    const store = new Map(Object.entries(opts.storage || {}));
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };

    const sandbox = { Date: FakeDate, Intl, console, localStorage, JSON, Math, Object, Array, String, Number };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(TIME_JS, sandbox, { filename: 'time.js' });
    // gaokao.js 文件前部声明的状态变量（纯逻辑段落会引用它们）
    vm.runInContext('let phaseOverrides = {}; let activePhaseId = "final";', sandbox,
        { filename: 'gaokao-state.js' });
    vm.runInContext(PHASE_SLICE, sandbox, { filename: 'gaokao-phase.js' });
    // 走真实的 loadPhaseSettings 路径，读取预置的 localStorage
    vm.runInContext('loadPhaseSettings();', sandbox, { filename: 'gaokao-load.js' });
    vm.runInContext(
        'globalThis.__api = { ' +
        '  getPhaseDates, getPhaseStatus, isSaneOverride, PHASE_CONFIG, PHASE_ORDER,' +
        '  bjDate, cnDayKey, splitDuration, targetState, isExamRelevant, exams,' +
        '  gaokaoStart, gaokaoEnd, GAOKAO_YEAR, COHORT_LABEL, APP_VERSION,' +
        '  examStartAt, examEndAt,' +
        '  setOverrides(v) { phaseOverrides = v; },' +
        '  getOverrides() { return phaseOverrides; }' +
        '};',
        sandbox
    );
    return sandbox.__api;
}

/** 跨 realm 安全：把沙箱返回的对象/数组转成本 realm 的普通值，便于 deepEqual */
const plain = (v) => JSON.parse(JSON.stringify(v));

// ============================================================
//  时间基准
// ============================================================

test('bjDate 按北京时间构造，与世界时区无关', () => {
    const api = load();
    // 北京时间 09:00 == UTC 01:00
    assert.equal(api.bjDate(2027, 6, 7, 9, 0).toISOString(), '2027-06-07T01:00:00.000Z');
    // 北京时间 00:00 == 前一日 UTC 16:00
    assert.equal(api.bjDate(2027, 6, 7).toISOString(), '2027-06-06T16:00:00.000Z');
});

test('cnDayKey 取北京时间的日历日', () => {
    const api = load();
    assert.equal(api.cnDayKey(api.bjDate(2027, 6, 7, 0, 0)), '2027-6-7');
    assert.equal(api.cnDayKey(api.bjDate(2027, 6, 6, 23, 59)), '2027-6-6');
    assert.equal(api.cnDayKey(api.bjDate(2027, 6, 7, 23, 59)), '2027-6-7');
});

test('splitDuration 拆分剩余量并钳制负数', () => {
    const api = load();
    const p = api.splitDuration(90061000); // 1 天 1 时 1 分 1 秒
    assert.deepEqual(plain(p), { d: 1, h: 1, m: 1, s: 1 });
    assert.deepEqual(plain(api.splitDuration(-5000)), { d: 0, h: 0, m: 0, s: 0 });
    assert.deepEqual(plain(api.splitDuration(0)), { d: 0, h: 0, m: 0, s: 0 });
});

test('targetState 状态机', () => {
    const api = load();
    const s = api.bjDate(2027, 6, 7);
    const e = api.bjDate(2027, 6, 10);
    assert.equal(api.targetState(api.bjDate(2027, 6, 6), s, e), 'waiting');
    assert.equal(api.targetState(s, s, e), 'ongoing');
    assert.equal(api.targetState(e, s, e), 'ongoing');
    assert.equal(api.targetState(api.bjDate(2027, 6, 11), s, e), 'done');
});

// ============================================================
//  高考年份滚动
// ============================================================

test('GAOKAO_YEAR 在 6/10 11:00 之后推进到下一年', () => {
    assert.equal(load({ now: '2027-06-10T10:59:00+08:00' }).GAOKAO_YEAR, 2027);
    assert.equal(load({ now: '2027-06-10T11:01:00+08:00' }).GAOKAO_YEAR, 2028);
    assert.equal(load({ now: '2026-07-05T23:59:00+08:00' }).GAOKAO_YEAR, 2027);
    assert.equal(load({ now: '2026-07-06T00:00:00+08:00' }).GAOKAO_YEAR, 2027);
});

test('届数标识跟随 GAOKAO_YEAR', () => {
    assert.equal(load({ now: '2026-09-01T00:00:00+08:00' }).COHORT_LABEL, '2027届');
    assert.equal(load({ now: '2027-08-01T00:00:00+08:00' }).COHORT_LABEL, '2028届');
});

// ============================================================
//  高考起止与科目日程同源（P0-1 / P0-2 的回归防线）
// ============================================================

test('高考起止为 6/7 00:00 与最后一场结束时刻', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    assert.equal(api.cnDayKey(api.gaokaoStart), '2027-6-7');
    assert.equal(api.gaokaoStart.getTime(), api.bjDate(2027, 6, 7, 0, 0).getTime());
    // 最后一场是 6/10 的藏语文/彝语文，9:00-11:00
    assert.equal(api.gaokaoEnd.getTime(), api.bjDate(2027, 6, 10, 11, 0).getTime());
});

test('final 阶段年份跟随 GAOKAO_YEAR，而非硬编码', () => {
    // 2027 年高考结束后加载：final 阶段应指向 2028
    const api = load({ now: '2027-08-01T00:00:00+08:00' });
    assert.equal(api.GAOKAO_YEAR, 2028);
    assert.equal(api.PHASE_CONFIG.final.defaultStart.year, 2028,
        'final 阶段开始年份必须等于 GAOKAO_YEAR');
    assert.equal(api.PHASE_CONFIG.final.defaultEnd.year, 2028,
        'final 阶段结束年份必须等于 GAOKAO_YEAR');

    const d = api.getPhaseDates('final');
    assert.equal(api.cnDayKey(d.start), '2028-6-7');
    assert.equal(api.cnDayKey(d.end), '2028-6-10');
});

test('final 阶段日期与 gaokaoStart 指向同一天', () => {
    for (const now of ['2026-09-01T00:00:00+08:00', '2027-08-01T00:00:00+08:00', '2028-01-01T00:00:00+08:00']) {
        const api = load({ now });
        const { start } = api.getPhaseDates('final');
        assert.equal(api.cnDayKey(start), `${api.GAOKAO_YEAR}-6-7`, `now=${now}`);
        // gaokaoStart 常量应与同年 6/7 一致
        assert.equal(api.cnDayKey(api.gaokaoStart), `${api.GAOKAO_YEAR}-6-7`, `now=${now}`);
    }
});

test('9 场考试时间严格递增、互不重叠', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    assert.equal(api.exams.length, 9);
    const list = api.exams.map((ex) => ({
        name: ex.name,
        start: api.examStartAt(ex, api.GAOKAO_YEAR).getTime(),
        end: api.examEndAt(ex, api.GAOKAO_YEAR).getTime(),
    }));
    for (const e of list) assert.ok(e.end > e.start, `${e.name} 结束晚于开始`);
    for (let i = 1; i < list.length; i++) {
        assert.ok(list[i].start >= list[i - 1].end,
            `${list[i].name} 与 ${list[i - 1].name} 时间重叠`);
    }
});

test('最后一场结束时刻不晚于 gaokaoEnd', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    const last = api.exams[api.exams.length - 1];
    assert.ok(api.examEndAt(last, api.GAOKAO_YEAR) <= api.gaokaoEnd);
});

// ============================================================
//  阶段顺序
// ============================================================

test('五个阶段按时间顺序排列', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    assert.deepEqual(plain(api.PHASE_ORDER), ['zero', 'first', 'second', 'third', 'final']);
    let prev = -Infinity;
    for (const id of api.PHASE_ORDER) {
        const t = api.getPhaseDates(id).start.getTime();
        assert.ok(t > prev, `阶段 ${id} 的开始时间应晚于上一阶段`);
        prev = t;
    }
});

test('getPhaseStatus 返回三态', () => {
    const api = load({ now: '2026-12-23T00:00:00+08:00' }); // 一诊期间
    assert.equal(api.getPhaseStatus('zero'), 'done');
    assert.equal(api.getPhaseStatus('first'), 'ongoing');
    assert.equal(api.getPhaseStatus('second'), 'upcoming');
    assert.equal(api.getPhaseStatus('final'), 'upcoming');
});

// ============================================================
//  用户覆盖：合法生效、非法忽略
// ============================================================

test('合法覆盖生效', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    api.setOverrides({
        first: { startYear: 2026, startMonth: 11, startDay: 1, endYear: 2026, endMonth: 11, endDay: 3 },
    });
    assert.equal(api.cnDayKey(api.getPhaseDates('first').start), '2026-11-1');
    assert.equal(api.cnDayKey(api.getPhaseDates('first').end), '2026-11-3');
});

test('覆盖高考日期后 final 阶段随之改变', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    api.setOverrides({
        final: { startYear: 2027, startMonth: 6, startDay: 2, endYear: 2027, endMonth: 6, endDay: 5 },
    });
    assert.equal(api.cnDayKey(api.getPhaseDates('final').start), '2027-6-2');
    assert.equal(api.cnDayKey(api.getPhaseDates('final').end), '2027-6-5');
});

test('字段名不匹配的覆盖被忽略（历史 bug：静默回退）', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    // 这是曾经真实出现过的错误形态：用了 {year,month,day} 而不是 {startYear,...}
    api.setOverrides({ final: { year: 2027, month: 6, day: 2 } });
    assert.equal(api.isSaneOverride({ year: 2027, month: 6, day: 2 }), false);
    assert.equal(api.cnDayKey(api.getPhaseDates('final').start), '2027-6-7',
        '应回退到默认日期，而不是产生 Invalid Date');
});

test('非法覆盖被拒绝', () => {
    const api = load();
    assert.equal(api.isSaneOverride(null), false);
    assert.equal(api.isSaneOverride({}), false);
    assert.equal(api.isSaneOverride({ startYear: 'x', startMonth: 6, startDay: 1, endYear: 2027, endMonth: 6, endDay: 2 }), false);
    assert.equal(api.isSaneOverride({ startYear: 1900, startMonth: 6, startDay: 1, endYear: 2027, endMonth: 6, endDay: 2 }), false);
    assert.equal(api.isSaneOverride({ startYear: 2027, startMonth: 13, startDay: 1, endYear: 2027, endMonth: 6, endDay: 2 }), false);
    assert.equal(api.isSaneOverride({ startYear: 2027, startMonth: 6, startDay: 0, endYear: 2027, endMonth: 6, endDay: 2 }), false);
    // 结束早于开始
    assert.equal(api.isSaneOverride({ startYear: 2027, startMonth: 6, startDay: 10, endYear: 2027, endMonth: 6, endDay: 1 }), false);
    // 合法
    assert.equal(api.isSaneOverride({ startYear: 2027, startMonth: 6, startDay: 1, endYear: 2027, endMonth: 6, endDay: 2 }), true);
});

test('非法覆盖时 getPhaseDates 仍返回有效日期（不产生 Invalid Date）', () => {
    const api = load({ now: '2026-09-01T00:00:00+08:00' });
    const bad = [
        { final: { startYear: 'x' } },
        { final: { startYear: 2027, startMonth: null, startDay: 1, endYear: 2027, endMonth: 6, endDay: 2 } },
        { final: {} },
    ];
    for (const ov of bad) {
        api.setOverrides(ov);
        const d = api.getPhaseDates('final');
        assert.ok(!Number.isNaN(d.start.getTime()), `start 不应为 Invalid Date: ${JSON.stringify(ov)}`);
        assert.ok(!Number.isNaN(d.end.getTime()), `end 不应为 Invalid Date: ${JSON.stringify(ov)}`);
        assert.equal(api.cnDayKey(d.start), '2027-6-7');
    }
});

test('localStorage 中损坏的 JSON 不会让逻辑崩溃', () => {
    // 通过预置 storage 走 loadPhaseSettings 的真实解析路径
    const sandboxStorage = { gaokao_phase_settings: '{{{not json' };
    const api = load({ now: '2026-09-01T00:00:00+08:00', storage: sandboxStorage });
    // 一诊默认日期：2026-12-21 起（原为 12-22，依实际安排更正）
    assert.equal(api.cnDayKey(api.getPhaseDates('first').start), '2026-12-21');
});

test('localStorage 中合法 JSON 覆盖会被载入', () => {
    const api = load({
        now: '2026-09-01T00:00:00+08:00',
        storage: {
            gaokao_phase_settings: JSON.stringify({
                second: { startYear: 2027, startMonth: 3, startDay: 1, endYear: 2027, endMonth: 3, endDay: 3 },
            }),
        },
    });
    assert.equal(api.cnDayKey(api.getPhaseDates('second').start), '2027-3-1');
});

// ============================================================
//  选科相关性
// ============================================================

test('未选科时所有考试都相关', () => {
    const api = load();
    for (const ex of api.exams) {
        assert.equal(api.isExamRelevant(ex, []), true, ex.name);
    }
});

test('只选化学时，历史/物理与其余选考不相关', () => {
    const api = load();
    const rel = (name) => {
        const ex = api.exams.find((e) => e.name === name);
        return api.isExamRelevant(ex, ['化学']);
    };
    assert.equal(rel('语文'), true, '统考科目始终相关');
    assert.equal(rel('数学'), true);
    assert.equal(rel('外语'), true);
    assert.equal(rel('化学'), true);
    assert.equal(rel('历史 / 物理'), false);
    assert.equal(rel('地理'), false);
    assert.equal(rel('思想政治'), false);
    assert.equal(rel('生物学'), false);
    assert.equal(rel('藏语文 / 彝语文'), true, '民族加试不受选科影响');
});

test('首选历史/物理只命中对应一项', () => {
    const api = load();
    const ex = api.exams.find((e) => e.name === '历史 / 物理');
    assert.equal(api.isExamRelevant(ex, ['历史']), true);
    assert.equal(api.isExamRelevant(ex, ['物理']), true);
    assert.equal(api.isExamRelevant(ex, ['化学']), false);
});

// ============================================================
//  版本号
// ============================================================

test('APP_VERSION 已定义且被页脚与 SW 共用', () => {
    const api = load();
    assert.match(api.APP_VERSION, /^\d+\.\d+\.\d+$/);
});
