import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  blank,
  example,
  check,
  createZip,
  zipName,
  ext,
  manualItems,
  parseConfig,
  readDuration,
  type Config,
  type Entry,
  type Rule,
} from "./core";
import "./style.css";
const storage = "before-submit-requirements-v1";
function initial() {
  try {
    const s = localStorage.getItem(storage);
    return s ? parseConfig(s) : example();
  } catch {
    return example();
  }
}
function download(data: Blob, name: string) {
  const u = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(2)} MB`;
function App() {
  const [config, setConfig] = useState<Config>(initial),
    [files, setFiles] = useState<Entry[]>([]),
    [manual, setManual] = useState([false, false, false]),
    [step, setStep] = useState(0),
    [notice, setNotice] = useState(
      "要求清单自动保存在此浏览器；刷新后文件需重新选择。",
    ),
    [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [hasChecked, setHasChecked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const results = check(config, files, manual);
  const issues = results.filter((x) => x.status === "issue");
  const pending = results.filter((x) => x.status === "manual");
  useEffect(() => {
    try {
      localStorage.setItem(storage, JSON.stringify(config));
    } catch {
      setNotice("本地保存失败，请导出 JSON 备份清单。");
    }
  }, [config]);
  function update(p: Partial<Config>) {
    setConfig((c) => ({ ...c, ...p }));
    setManual([false, false, false]);
  }
  function rule(id: string, p: Partial<Rule>) {
    update({
      rules: config.rules.map((r) => (r.id === id ? { ...r, ...p } : r)),
    });
  }
  function editFiles(fn: (f: Entry[]) => Entry[]) {
    setFiles(fn);
    setManual([false, false, false]);
  }
  function load(c: Config) {
    if (!window.confirm("替换当前要求清单？已有文件将保留，但需要重新归类。"))
      return;
    setConfig(c);
    editFiles((fs) => fs.map((f) => ({ ...f, ruleId: "" })));
    setHasChecked(false);
    setNotice("清单已替换，请确认规则并重新归类文件。");
  }
  async function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const added = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      ruleId: "",
    }));
    editFiles((fs) => [...fs, ...added]);
    setNotice(
      `已导入 ${added.length} 个文件，请手动选择对应材料。正在读取可识别的视频元数据…`,
    );
    await Promise.all(
      added
        .filter((f) => ["mp4", "webm", "mov"].includes(ext(f.name)))
        .map(async (f) => {
          const duration = await readDuration(f.file);
          setFiles((fs) =>
            fs.map((e) => (e.id === f.id ? { ...e, duration } : e)),
          );
        }),
    );
    setNotice(
      `已导入 ${added.length} 个文件。视频时长读取失败时将要求人工确认。`,
    );
  }
  function demoFiles() {
    if (
      files.length &&
      !confirm("体验示例会替换当前文件列表，原文件不会被修改。继续？")
    )
      return;
    const c = example();
    c.team = "拾光小队";
    c.project = "校园待办助手";
    setConfig(c);
    setFiles(
      [
        {
          id: crypto.randomUUID(),
          file: new File(
            ["这是无隐私体验文件。请勿作为真实材料提交。"],
            "作品链接.txt",
            { type: "text/plain" },
          ),
          name: "作品链接.txt",
          ruleId: "example-0",
        },
        {
          id: crypto.randomUUID(),
          file: new File(["说明扩展名故意不符合要求"], "使用说明.exe"),
          name: "说明.txt",
          ruleId: "example-2",
        },
        {
          id: crypto.randomUUID(),
          file: new File(["第二份同名说明"], "另一份说明.txt"),
          name: "说明.txt",
          ruleId: "example-2",
        },
        {
          id: crypto.randomUUID(),
          file: new File(["# 版本记录\n仅供体验"], "版本记录.md"),
          name: "版本记录.md",
          ruleId: "example-4",
        },
      ].map((f, i) =>
        i === 1
          ? { ...f, name: "使用说明.exe" }
          : i === 2
            ? { ...f, name: "版本记录.md" }
            : f,
      ),
    );
    setManual([false, false, false]);
    setDemo(true);
    setStep(1);
    setHasChecked(false);
    setNotice(
      "体验示例已载入：视频和 Prompt 日志缺失、说明扩展名错误、导出文件名冲突。所有文件由程序真实生成。",
    );
  }
  async function exportZip() {
    setBusy(true);
    setNotice("正在读取文件并压缩，请保持页面打开…");
    try {
      const bytes = await createZip(config, files, manual);
      download(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
        zipName(config),
      );
      setNotice(
        `ZIP 已生成并发起下载，包含 ${files.length} 个文件和检查报告。${pending.length ? "报告保留尚未人工确认的事项。" : ""}`,
      );
    } catch (e) {
      setNotice(`导出失败：${e instanceof Error ? e.message : "请重试"}`);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    label: string,
    key: "team" | "project" | "track" | "template",
    placeholder: string,
  ) => (
    <label>
      {label}
      <input
        value={config[key]}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">✓</span>交前看一眼
          <span className="badge">本地工具</span>
        </a>
        <span className="privacy">◎ 文件留在你的浏览器</span>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">提交前的最后一道小检查</div>
            <h1>
              提交材料前，<span>检查一下。</span>
            </h1>
            <p>把遗漏、格式和命名问题，留在提交之前。</p>
          </div>
          <button className="secondary" onClick={demoFiles}>
            体验示例 ↗
          </button>
        </section>
        <nav aria-label="操作步骤" className="steps">
          {["确认要求", "导入与归类", "检查与修正", "预览与导出"].map(
            (s, i) => (
              <button
                key={s}
                className={step === i ? "active" : ""}
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
              >
                <span>{i + 1}</span>
                {s}
              </button>
            ),
          )}
        </nav>
        <div className="notice" role="status">
          {notice}
        </div>
        {demo && (
          <div className="demo">
            ◇ 体验模式 · 示例文件不用于正式提交
            <button
              onClick={() => {
                setFiles([]);
                setDemo(false);
                setManual([false, false, false]);
                setHasChecked(false);
                setNotice("示例文件已清空，当前要求清单仍可编辑。");
              }}
            >
              清空示例文件
            </button>
          </div>
        )}
        <div className="layout">
          <section className="workspace">
            {step === 0 && (
              <>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">STEP 01</div>
                    <h2>先把要求说明白</h2>
                    <p>按官方通知填写，检查才有依据。</p>
                  </div>
                  <span className="chip">自动本地保存</span>
                </div>
                <div className="toolbar">
                  <button onClick={() => load(blank())}>空白清单</button>
                  <button onClick={() => load(example())}>
                    本次比赛示例清单
                  </button>
                  <button
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(config, null, 2)], {
                          type: "application/json",
                        }),
                        "提交要求.json",
                      )
                    }
                  >
                    导出 JSON
                  </button>
                  <button onClick={() => jsonInput.current?.click()}>
                    导入 JSON
                  </button>
                  <input
                    ref={jsonInput}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        try {
                          if (f.size > 1024 * 1024)
                            throw new Error("清单不能超过 1 MB");
                          load(parseConfig(await f.text()));
                        } catch (err) {
                          setNotice(
                            `导入失败：${err instanceof Error ? err.message : "JSON 无效"}`,
                          );
                        }
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="form-grid">
                  {field("队名", "team", "例如：拾光小队")}
                  {field("作品名", "project", "例如：校园待办助手")}
                  {field("赛道", "track", "填写你的参赛赛道")}
                  {field(
                    "最终 ZIP 文件名模板",
                    "template",
                    "{队名}—AI实用作品—{作品名}.zip",
                  )}
                </div>
                <p className="hint">
                  可用占位符：{"{队名}、{作品名}、{赛道}"}
                  。示例规则可编辑，请以官方通知为准；未预设文件大小限制。
                </p>
                <div className="section-heading compact">
                  <h3>
                    材料要求 <small>{config.rules.length} 项</small>
                  </h3>
                  <button
                    onClick={() =>
                      update({
                        rules: [
                          ...config.rules,
                          {
                            id: crypto.randomUUID(),
                            name: "新材料",
                            required: true,
                            extensions: "",
                            min: 1,
                            maxMB: null,
                            keyword: "",
                          },
                        ],
                      })
                    }
                  >
                    ＋ 添加材料
                  </button>
                </div>
                {!config.rules.length && (
                  <div className="empty">
                    从一项材料开始，或载入比赛示例清单。
                  </div>
                )}
                {config.rules.map((r, i) => (
                  <article className="rule" key={r.id}>
                    <div className="rule-top">
                      <span className="number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <label className="rule-name">
                        材料名称
                        <input
                          value={r.name}
                          onChange={(e) => rule(r.id, { name: e.target.value })}
                        />
                      </label>
                      <label className="inline">
                        <input
                          type="checkbox"
                          checked={r.required}
                          onChange={(e) =>
                            rule(r.id, { required: e.target.checked })
                          }
                        />
                        必交
                      </label>
                      <button
                        className="text-danger"
                        aria-label={`删除${r.name}`}
                        onClick={() => {
                          update({
                            rules: config.rules.filter((x) => x.id !== r.id),
                          });
                          editFiles((fs) =>
                            fs.map((f) =>
                              f.ruleId === r.id ? { ...f, ruleId: "" } : f,
                            ),
                          );
                        }}
                      >
                        删除
                      </button>
                    </div>
                    <div className="rule-fields">
                      <label>
                        允许扩展名
                        <input
                          value={r.extensions}
                          placeholder="不限；多个用逗号隔开"
                          onChange={(e) =>
                            rule(r.id, { extensions: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        最少数量
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={r.min}
                          onChange={(e) =>
                            rule(r.id, {
                              min: Math.max(
                                0,
                                Math.min(
                                  10000,
                                  Math.floor(Number(e.target.value)),
                                ),
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        单文件上限（MB）
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={r.maxMB ?? ""}
                          placeholder="不限"
                          onChange={(e) =>
                            rule(r.id, {
                              maxMB: e.target.value
                                ? Math.max(0.001, Number(e.target.value))
                                : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        文件名关键词
                        <input
                          value={r.keyword}
                          placeholder="可不填"
                          onChange={(e) =>
                            rule(r.id, { keyword: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="inline hint">
                      <input
                        type="checkbox"
                        checked={!!r.video}
                        onChange={(e) =>
                          rule(r.id, { video: e.target.checked })
                        }
                      />
                      检查视频不超过 180 秒（读取失败则人工确认）
                    </label>
                  </article>
                ))}
                <button
                  className="primary bottom-action"
                  onClick={() => setStep(1)}
                >
                  确认要求，导入文件 →
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">STEP 02</div>
                    <h2>文件就位，各归其类</h2>
                    <p>归类由你确认，一个材料可以对应多个文件。</p>
                  </div>
                </div>
                <div
                  className={`drop ${drag ? "drag" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void addFiles(e.dataTransfer.files);
                  }}
                >
                  <span className="upload-icon">↑</span>
                  <h3>把提交文件拖到这里</h3>
                  <p>或选择多个文件 · 仅在本地处理</p>
                  <button
                    className="primary"
                    onClick={() => input.current?.click()}
                  >
                    选择文件
                  </button>
                  <input
                    ref={input}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      void addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="section-heading compact">
                  <h3>
                    已导入文件 <small>{files.length} 份</small>
                  </h3>
                  {files.length > 0 && (
                    <button
                      onClick={() => {
                        if (
                          confirm("清空当前文件列表？不会删除你的原始文件。")
                        ) {
                          editFiles(() => []);
                          setDemo(false);
                        }
                      }}
                    >
                      清空文件
                    </button>
                  )}
                </div>
                {!files.length && (
                  <div className="empty">
                    还没有文件。先导入，再为每份文件选择材料。
                  </div>
                )}
                {files.map((f) => (
                  <article className="file-row" key={f.id}>
                    <div className="file-symbol">
                      {ext(f.name).slice(0, 5) || "FILE"}
                    </div>
                    <div className="file-info">
                      <strong>{f.file.name}</strong>
                      <span>
                        {size(f.file.size)} · {ext(f.file.name) || "无扩展名"}
                        {f.duration != null
                          ? ` · ${f.duration.toFixed(1)} 秒`
                          : ""}
                      </span>
                    </div>
                    <label className="classification">
                      归入材料
                      <select
                        aria-label={`${f.file.name}归入材料`}
                        value={f.ruleId}
                        onChange={(e) =>
                          editFiles((fs) =>
                            fs.map((x) =>
                              x.id === f.id
                                ? { ...x, ruleId: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">请选择材料</option>
                        {config.rules.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="text-danger"
                      onClick={() =>
                        editFiles((fs) => fs.filter((x) => x.id !== f.id))
                      }
                      aria-label={`移除${f.file.name}`}
                    >
                      移除
                    </button>
                  </article>
                ))}
                <button
                  className="primary bottom-action"
                  onClick={() => {
                    setStep(2);
                    setHasChecked(true);
                  }}
                >
                  执行检查 →
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">STEP 03</div>
                    <h2>问题清楚，修正有数</h2>
                    <p>结果随要求、归类和导出文件名实时更新。</p>
                  </div>
                  <button
                    onClick={() => {
                      setHasChecked(true);
                      setNotice("已按当前要求、归类及导出文件名重新检查。");
                    }}
                  >
                    ↻ 重新检查
                  </button>
                </div>
                <div className="stats">
                  <div>
                    <b>{issues.length}</b>
                    <span>! 发现问题</span>
                  </div>
                  <div>
                    <b>{pending.length}</b>
                    <span>○ 需要人工确认</span>
                  </div>
                  <div>
                    <b>{results.filter((r) => r.status === "pass").length}</b>
                    <span>✓ 规则已通过</span>
                  </div>
                </div>
                {!hasChecked && (
                  <p className="hint">以下为当前实时检查结果。</p>
                )}
                <div className="results">
                  {results.map((r, i) => (
                    <div className={`result ${r.status}`} key={i}>
                      <b>
                        {r.status === "issue"
                          ? "!"
                          : r.status === "manual"
                            ? "○"
                            : "✓"}
                      </b>
                      <span>
                        <small>
                          {r.status === "issue"
                            ? "发现问题"
                            : r.status === "manual"
                              ? "需要人工确认"
                              : "已通过"}
                        </small>
                        {r.text}
                      </span>
                    </div>
                  ))}
                </div>
                <h3>修正导出文件名</h3>
                <p className="hint">
                  只影响压缩包中的名称，原文件不会被修改。更改扩展名不会转换文件格式；格式错误请换成真实的正确格式文件。
                </p>
                <div className="toolbar">
                  <button
                    disabled={!config.team}
                    onClick={() =>
                      editFiles((fs) =>
                        fs.map((f) => ({
                          ...f,
                          name: `${config.team}—${f.name}`,
                        })),
                      )
                    }
                  >
                    批量添加队名前缀
                  </button>
                  <button
                    disabled={!config.project}
                    onClick={() =>
                      editFiles((fs) =>
                        fs.map((f) => ({
                          ...f,
                          name: `${config.project}—${f.name}`,
                        })),
                      )
                    }
                  >
                    批量添加作品名前缀
                  </button>
                </div>
                {files.map((f) => (
                  <label className="rename" key={f.id}>
                    <span>{f.file.name}</span>
                    <input
                      aria-label={`${f.file.name}导出文件名`}
                      value={f.name}
                      onChange={(e) =>
                        editFiles((fs) =>
                          fs.map((x) =>
                            x.id === f.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                {!files.length && (
                  <div className="empty">还未导入文件，请返回第二步。</div>
                )}
                <h3>留给你亲自确认</h3>
                <p className="hint">
                  这些内容不能自动判定。只勾选已实际核对的事项；更改要求或文件后需重新确认。
                </p>
                {manualItems.map((s, i) => (
                  <label className="manual" key={s}>
                    <input
                      type="checkbox"
                      checked={manual[i]}
                      onChange={(e) =>
                        setManual((m) =>
                          m.map((x, j) => (j === i ? e.target.checked : x)),
                        )
                      }
                    />
                    {s}
                  </label>
                ))}
                <button
                  className="primary bottom-action"
                  onClick={() => setStep(3)}
                >
                  预览导出目录 →
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">STEP 04</div>
                    <h2>最后看一眼，再出发</h2>
                    <p>预览与 ZIP 使用相同文件名；检查报告会一起打包。</p>
                  </div>
                </div>
                <div className="export-status">
                  <strong>
                    {issues.length
                      ? `! 还有 ${issues.length} 个问题需要修正`
                      : pending.length
                        ? `○ 文件规则通过，${pending.length} 项待人工确认`
                        : "✓ 当前规则检查与人工确认已完成"}
                  </strong>
                  <p>
                    {issues.length
                      ? "修正所有问题后才能导出，防止材料遗漏或文件被覆盖。"
                      : "已通过不代表主办方审核通过，请以官方要求为准。"}
                  </p>
                </div>
                <label>
                  最终 ZIP 文件名模板
                  <input
                    value={config.template}
                    onChange={(e) => update({ template: e.target.value })}
                  />
                </label>
                <div className="tree">
                  <div className="tree-root">
                    ▣ {zipName(config) || "未命名.zip"}
                  </div>
                  {files.map((f) => (
                    <div key={f.id}>
                      <span>├─</span> {f.name}{" "}
                      <small>{size(f.file.size)}</small>
                    </div>
                  ))}
                  <div>
                    <span>└─</span> 检查报告.md{" "}
                    <small>自动生成 · 含未解决事项</small>
                  </div>
                </div>
                <p className="hint">
                  目录为 ZIP
                  根目录，不创建材料子文件夹。压缩在内存中完成，大文件可能受浏览器内存限制。
                </p>
                {issues.length > 0 && (
                  <button onClick={() => setStep(2)}>← 查看并修正问题</button>
                )}
                <button
                  className="primary bottom-action"
                  disabled={busy || issues.length > 0}
                  onClick={() => void exportZip()}
                >
                  {busy ? "正在压缩…" : "↓ 导出 ZIP 与检查报告"}
                </button>
                {pending.length > 0 && (
                  <p className="hint">
                    允许带未勾选的人工确认项导出；报告会明确记录，绝不标记为全部通过。
                  </p>
                )}
              </>
            )}
          </section>
          <aside>
            <div className="side-card">
              <div className="eyebrow">这次提交</div>
              <h3>{config.project || "你的作品，准备就绪了吗？"}</h3>
              <p>{config.team || "尚未填写队名"}</p>
              <div className="side-line">
                <span>材料要求</span>
                <b>{config.rules.length} 项</b>
              </div>
              <div className="side-line">
                <span>已导入文件</span>
                <b>{files.length} 份</b>
              </div>
              <div className="side-line">
                <span>尚未归类</span>
                <b>
                  {
                    files.filter(
                      (f) => !config.rules.some((r) => r.id === f.ruleId),
                    ).length
                  }{" "}
                  份
                </b>
              </div>
              <hr />
              <h4>提交小贴士</h4>
              <p>
                先确认官方通知，再整理材料。示例只是起点，每一条规则都可以修改。
              </p>
              <button className="side-link" onClick={() => setStep(0)}>
                编辑要求清单 →
              </button>
            </div>
            <div className="boundary">
              <span>◎</span>
              <h4>我们能检查什么？</h4>
              <p>
                文件结构、命名和你设定的规则。扩展名不代表真实格式；不能确认内容正确、作品原创、链接可用或主办方一定接收。
              </p>
              <p>“已通过”不等于审核通过。</p>
            </div>
          </aside>
        </div>
        <footer>
          <span>交前看一眼 · 让最后一步，更从容</span>
          <span>无需登录 · 不上传文件 · 无 AI API</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
