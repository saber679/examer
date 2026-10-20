import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  blank,
  check,
  filenameError,
  createZip,
  parseConfig,
  report,
  type Entry,
  type Config,
} from "./core";
const cfg = (): Config => ({
  ...blank(),
  team: "测试队",
  project: "测试作品",
  rules: [
    {
      id: "r",
      name: "使用说明",
      required: true,
      extensions: "txt",
      min: 1,
      maxMB: 1,
      keyword: "",
    },
  ],
});
const entry = (name = "说明.txt", size = 1): Entry => ({
  id: "1",
  name,
  ruleId: "r",
  file: new File([new Uint8Array(size)], name),
});
const issues = (c: Config, e: Entry[]) =>
  check(c, e, [true, true, true]).filter((r) => r.status === "issue");
test("必交缺失及可选项未提交", () => {
  assert.match(issues(cfg(), [])[0].text, /还缺 1/);
  const c = cfg();
  c.rules[0].required = false;
  assert.equal(issues(c, []).length, 0);
});
test("扩展名大小写与真实不符", () => {
  assert.equal(issues(cfg(), [entry("说明.TXT")]).length, 0);
  assert.match(issues(cfg(), [entry("说明.exe")])[0].text, /扩展名/);
});
test("大小恰好达到限制通过，超一字节失败", () => {
  assert.equal(issues(cfg(), [entry("说明.txt", 1048576)]).length, 0);
  assert.match(issues(cfg(), [entry("说明.txt", 1048577)])[0].text, /超过/);
});
test("多文件计数、修改及取消归类后重新检查", () => {
  const c = cfg();
  c.rules[0].min = 2;
  const a = entry(),
    b = { ...entry("第二.txt"), id: "2" };
  assert.equal(issues(c, [a, b]).length, 0);
  assert.match(
    issues(c, [a, { ...b, ruleId: "" }])
      .map((r) => r.text)
      .join(),
    /还缺 1/,
  );
  assert.match(
    issues(c, [{ ...a, ruleId: "deleted" }])
      .map((r) => r.text)
      .join(),
    /尚未归类/,
  );
});
test("重命名冲突忽略大小写，报告保留名也不可用", () => {
  assert.match(
    issues(cfg(), [entry(), { ...entry("说明.TXT"), id: "2" }])
      .map((r) => r.text)
      .join(),
    /冲突/,
  );
  assert.match(
    issues(cfg(), [entry("检查报告.md")])
      .map((r) => r.text)
      .join(),
    /冲突/,
  );
});
test("拒绝路径穿越、非法字符、系统保留名称及超长名称", () => {
  for (const s of [
    "../a.txt",
    "a/b.txt",
    "a\\b.txt",
    "a:b.txt",
    "NUL.txt",
    "test.",
    " a.txt",
    "a\0.txt",
    "好".repeat(90),
  ])
    assert.ok(filenameError(s), s);
  assert.equal(filenameError("队名—说明.txt"), null);
});
test("关键词与视频时长检查", () => {
  const c = cfg();
  c.rules[0].keyword = "队名";
  c.rules[0].video = true;
  assert.match(
    check(c, [entry()], [true, true, true])
      .map((r) => r.text)
      .join(),
    /关键词|需包含/,
  );
  assert.ok(
    check(
      c,
      [{ ...entry("队名.txt"), duration: null }],
      [true, true, true],
    ).some((r) => r.status === "manual"),
  );
  assert.match(
    issues(c, [{ ...entry("队名.txt"), duration: 181 }])
      .map((r) => r.text)
      .join(),
    /180/,
  );
  assert.equal(issues(c, [{ ...entry("队名.txt"), duration: 180 }]).length, 0);
});
test("ZIP 内容与预览文件列表一致，保留原始字节，报告记录人工未确认", async () => {
  const es = [entry("最终.txt", 12)];
  const bytes = await createZip(cfg(), es, [false, false, false]);
  const zip = unzipSync(bytes);
  assert.deepEqual(Object.keys(zip), [...es.map((e) => e.name), "检查报告.md"]);
  assert.deepEqual(
    zip["最终.txt"],
    new Uint8Array(await es[0].file.arrayBuffer()),
  );
  assert.match(strFromU8(zip["检查报告.md"]), /需要人工确认/);
  assert.match(strFromU8(zip["检查报告.md"]), /未审阅/);
});
test("有问题时阻止 ZIP 导出", async () => {
  await assert.rejects(createZip(cfg(), [], [true, true, true]), /修正/);
});
test("JSON 清单校验与报告输出", () => {
  assert.deepEqual(parseConfig(JSON.stringify(cfg())), cfg());
  for (const data of [
    "null",
    "{}",
    JSON.stringify({ ...cfg(), rules: [{ ...cfg().rules[0], min: -1 }] }),
  ])
    assert.throws(() => parseConfig(data));
  assert.match(report(cfg(), [], [false, false, false]), /还缺 1/);
});
