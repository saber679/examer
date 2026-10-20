import { zipSync, strToU8 } from "fflate";
export type Rule = {
  id: string;
  name: string;
  required: boolean;
  extensions: string;
  min: number;
  maxMB: number | null;
  keyword: string;
  video?: boolean;
};
export type Config = {
  team: string;
  project: string;
  track: string;
  template: string;
  rules: Rule[];
};
export type Entry = {
  id: string;
  file: File;
  name: string;
  ruleId: string;
  duration?: number | null;
};
export type Result = { status: "issue" | "manual" | "pass"; text: string };
export const manualItems = [
  "已打开最终作品确认能运行",
  "演示视频展示了实际操作",
  "Prompt 日志包含工具、Prompt、AI 返回结果、人工修改四项",
];
export const blank = (): Config => ({
  team: "",
  project: "",
  track: "",
  template: "{队名}—AI实用作品—{作品名}.zip",
  rules: [],
});
export const example = (): Config => ({
  ...blank(),
  track: "智核杯—AI 实用作品赛道",
  rules: [
    ["作品文件或链接说明", ""],
    ["三分钟以内的演示视频", "mp4,webm,mov"],
    ["使用说明", "pdf,docx,md,txt"],
    ["Prompt 日志", "pdf,docx,md,txt,xlsx,csv"],
    ["版本记录", "zip,pdf,md,txt"],
  ].map(([name, extensions], i) => ({
    id: `example-${i}`,
    name,
    extensions,
    required: true,
    min: 1,
    maxMB: null,
    keyword: "",
    video: i === 1,
  })),
});
export const ext = (s: string) =>
  s.includes(".") ? s.split(".").pop()!.toLowerCase() : "";
export function filenameError(s: string): string | null {
  if (!s.trim()) return "文件名不能为空";
  if (s !== s.trim() || /[. ]$/.test(s))
    return "文件名不能以空格开头或以点、空格结尾";
  if (s === "." || s === ".." || /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(s))
    return '文件名含路径分隔符或非法字符，请移除 / \\ : * ? " < > | 等字符';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))
    return "文件名属于系统保留名称";
  if (new TextEncoder().encode(s).length > 240)
    return "文件名过长（最多 240 字节）";
  return null;
}
export const zipName = (c: Config) =>
  c.template
    .replaceAll("{队名}", c.team)
    .replaceAll("{作品名}", c.project)
    .replaceAll("{赛道}", c.track);
export function check(
  c: Config,
  entries: Entry[],
  manual: boolean[],
): Result[] {
  const out: Result[] = [];
  if (!c.rules.length)
    out.push({ status: "issue", text: "还没有材料要求，请添加或载入示例清单" });
  for (const r of c.rules) {
    if (!r.name.trim())
      out.push({
        status: "issue",
        text: "材料名称不能为空，请在第一步补充名称",
      });
    const fs = entries.filter((f) => f.ruleId === r.id);
    const need = r.required || fs.length > 0;
    if (need && fs.length < Math.max(r.required ? 1 : 0, r.min))
      out.push({
        status: "issue",
        text: `${r.name}：还缺 ${Math.max(r.required ? 1 : 0, r.min) - fs.length} 份文件（现有 ${fs.length} 份）`,
      });
    for (const f of fs) {
      const allowed = r.extensions
        .toLowerCase()
        .split(/[,，\s]+/)
        .map((x) => x.replace(/^\./, ""))
        .filter(Boolean);
      if (allowed.length && !allowed.includes(ext(f.name)))
        out.push({
          status: "issue",
          text: `${f.name}：扩展名不符合「${r.name}」，允许 ${allowed.join("、")}`,
        });
      if (r.maxMB !== null && f.file.size > r.maxMB * 1024 * 1024)
        out.push({
          status: "issue",
          text: `${f.name}：超过单文件 ${r.maxMB} MB 限制`,
        });
      if (r.keyword && !f.name.toLowerCase().includes(r.keyword.toLowerCase()))
        out.push({
          status: "issue",
          text: `${f.name}：文件名需包含「${r.keyword}」`,
        });
      if (r.video) {
        if (f.duration === undefined || f.duration === null)
          out.push({
            status: "manual",
            text: `${f.name}：未能读取视频时长，请人工确认不超过 180 秒`,
          });
        else if (f.duration > 180)
          out.push({
            status: "issue",
            text: `${f.name}：视频 ${f.duration.toFixed(1)} 秒，超过 180 秒`,
          });
      }
    }
  }
  const seen = new Set(["检查报告.md"]);
  for (const f of entries) {
    const err = filenameError(f.name);
    if (err)
      out.push({ status: "issue", text: `${f.name || "未命名文件"}：${err}` });
    const key = f.name.normalize("NFC").toLowerCase();
    if (seen.has(key))
      out.push({
        status: "issue",
        text: `${f.name}：导出文件名冲突（包含报告文件名，忽略大小写）`,
      });
    seen.add(key);
    if (!c.rules.some((r) => r.id === f.ruleId))
      out.push({ status: "issue", text: `${f.name}：尚未归类` });
  }
  const zn = zipName(c);
  const ze = filenameError(zn);
  if (ze || !zn.toLowerCase().endsWith(".zip"))
    out.push({
      status: "issue",
      text: `ZIP 文件名：${ze || "必须以 .zip 结尾"}`,
    });
  manualItems.forEach((t, i) => {
    if (!manual[i]) out.push({ status: "manual", text: t });
  });
  if (!out.some((x) => x.status === "issue"))
    out.unshift({
      status: "pass",
      text: "文件结构和已设规则检查通过；不代表主办方审核通过",
    });
  return out;
}
const md = (s: string) =>
  s.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/[\r\n]/g, " ");
export function report(
  c: Config,
  es: Entry[],
  manual: boolean[],
  time = new Date(),
): string {
  const results = check(c, es, manual);
  return `# 交前看一眼 · 检查报告\n\n检查时间：${time.toISOString()}\n\n队名：${md(c.team)} / 作品：${md(c.project)} / 赛道：${md(c.track)}\n\n## 已确认的提交要求（用户当前设置）\n${c.rules.map((r) => `- ${md(r.name)}：${r.required ? "必交" : "选交"}，至少 ${r.min} 份，扩展名 ${md(r.extensions) || "不限"}，单文件 ${r.maxMB === null ? "不限" : r.maxMB + " MB"}，关键词 ${md(r.keyword) || "不限"}`).join("\n")}\n\n## 文件清单\n${es.map((e) => `- ${md(e.name)}（${e.file.size} 字节；原文件：${md(e.file.name)}；材料：${md(c.rules.find((r) => r.id === e.ruleId)?.name || "未归类")}）`).join("\n")}\n\n## 检查结果与未解决问题\n${results.map((r) => `- [${r.status === "issue" ? "发现问题" : r.status === "manual" ? "需要人工确认" : "已通过"}] ${md(r.text)}`).join("\n")}\n\n## 人工确认\n${manualItems.map((s, i) => `- [${manual[i] ? "x" : " "}] ${s}`).join("\n")}\n\n## 检查边界\n仅检查文件结构、文件名及用户设定的规则；扩展名检查不验证真实文件格式。不能保证内容正确、作品原创、链接可访问或符合主办方要求。未审阅说明页数或 Prompt 日志内容。已通过不代表主办方审核通过。\n`;
}
export async function createZip(c: Config, es: Entry[], manual: boolean[]) {
  const issues = check(c, es, manual).filter((r) => r.status === "issue");
  if (issues.length) throw new Error("请先修正所有发现的问题再导出");
  const data: Record<string, Uint8Array> = Object.create(null);
  for (const e of es) data[e.name] = new Uint8Array(await e.file.arrayBuffer());
  data["检查报告.md"] = strToU8(report(c, es, manual));
  return zipSync(data, { level: 6 });
}
export function parseConfig(raw: string): Config {
  const c = JSON.parse(raw);
  if (
    !c ||
    typeof c !== "object" ||
    !["team", "project", "track", "template"].every(
      (k) => typeof c[k] === "string",
    ) ||
    !Array.isArray(c.rules) ||
    c.rules.length > 100
  )
    throw new Error("清单结构不正确（最多 100 项）");
  const ids = new Set();
  for (const r of c.rules) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.name !== "string" ||
      !r.name.trim() ||
      typeof r.required !== "boolean" ||
      typeof r.extensions !== "string" ||
      typeof r.keyword !== "string" ||
      !Number.isInteger(r.min) ||
      r.min < 0 ||
      r.min > 10000 ||
      !(
        r.maxMB === null ||
        (typeof r.maxMB === "number" && Number.isFinite(r.maxMB) && r.maxMB > 0)
      ) ||
      (r.video !== undefined && typeof r.video !== "boolean")
    )
      throw new Error("材料项格式不正确，请检查名称、数量和体积限制");
    ids.add(r.id);
  }
  return c;
}
export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (n: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      resolve(n);
    };
    const timer = setTimeout(() => finish(null), 6000);
    v.preload = "metadata";
    v.onloadedmetadata = () =>
      finish(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => finish(null);
    v.src = url;
  });
}
