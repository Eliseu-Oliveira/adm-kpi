import React, { useMemo, useState } from "react";
import { isoToday, formatNumber } from "../utils";

const SHIFT_WINDOWS = {
  NOITE: "23:40 AS 7:30",
  "MANHÃ": "07:30 AS 15:30",
  TARDE: "15:30 AS 23:40",
};

const FARELO_TYPES = ["Moído", "Floculado", "Hipro"];

// Metas (iguais à aba "Metas" da planilha)
const META_BY_FARELO = {
  "Moído": {
    proteinaMin: 46,
    proteinaMax: 46.5,
    umidadeMin: 12,
    umidadeMax: 12.5,
  },
  "Floculado": {
    proteinaMin: 46,
    proteinaMax: 46.5,
    umidadeMin: 12,
    umidadeMax: 12.5,
  },
  "Hipro": {
    proteinaMin: 47,
    proteinaMax: 48,
    umidadeMin: 11,
    umidadeMax: 12.5,
  },
};

const KPI_GROUPS = [
  {
    key: "umidEntrada",
    title: "Umidade Soja Entrada Secador Motomco",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Entre 10 a 12",
  },
  {
    key: "umidProducao",
    title: "Umidade Soja Produção-Motomco",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Entre 9.5 a 10.5",
  },
  {
    key: "umidFarelo",
    title: "Umidade do farelo",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: (farelo) => {
      const m = META_BY_FARELO[farelo];
      return m ? `Entre ${m.umidadeMin} e ${m.umidadeMax}` : "Entre — e —";
    },
  },
  {
    key: "protFarelo",
    title: "Proteína Farelo",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: (farelo) => {
      const m = META_BY_FARELO[farelo];
      return m ? `Entre ${m.proteinaMin} e ${m.proteinaMax}` : "Entre — e —";
    },
  },
  {
    key: "oleoFarelo",
    title: "Óleo Farelo",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Máximo 2.5",
  },
  {
    key: "fibraFarelo",
    title: "Fibra Farelo",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Máximo 6",
  },
  {
    key: "lex",
    title: "Lex",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Máximo 0.7",
  },
  {
    key: "oleoCasca",
    title: "oleo da casca",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Máximo 0.85",
  },
  {
    key: "massaExpandida",
    title: "Massa Expandida",
    execLabel: "Executado",
    metaLabel: "Meta",
    metaText: () => "Entre 8.5 e 9.5",
  },
];

function makeRowsForShift(shift) {
  const ranges = {
    NOITE: { start: 0, end: 7 },
    "MANHÃ": { start: 8, end: 15 },
    TARDE: { start: 16, end: 23 },
  };
  const { start, end } = ranges[shift];

  const rows = [];
  for (let h = start; h <= end; h++) {
    const hh = String(h).padStart(2, "0");
    const label = h % 2 === 1 ? `EXTRA ${hh}:00` : `${hh}:00`;
    rows.push({ id: crypto.randomUUID(), hora: label, values: {} });
  }
  // linha "EXTRA" vazia (igual na planilha) + linha MÉDIA
  rows.push({ id: crypto.randomUUID(), hora: "EXTRA", values: {} });
  return rows;
}

function avg(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export default function KpiMoagemSHO() {
  const [date, setDate] = useState(isoToday());
  const [shift, setShift] = useState("NOITE");
  const [farelo, setFarelo] = useState("Moído");

  // bloco produção turnos + tratativa (igual à direita da planilha)
  const [prod, setProd] = useState({
    sojaExec: "",
    sojaMeta: "562.5",
    fareloExec: "",
    fareloMeta: "422",
    desvio: "",
    operador: "",
    lider: "",
    solucao: "",
    conclusao: "",
  });

  const [rows, setRows] = useState(() => makeRowsForShift("NOITE"));

  // quando muda turno, recria linhas do turno (igual Excel)
  function changeShift(nextShift) {
    setShift(nextShift);
    setRows(makeRowsForShift(nextShift));
  }

  const media = useMemo(() => {
    const out = {};
    for (const g of KPI_GROUPS) {
      const nums = rows
        .filter((r) => r.hora !== "EXTRA") // ignora a linha EXTRA vazia
        .map((r) => Number(r.values[g.key]))
        .filter((n) => Number.isFinite(n));
      out[g.key] = avg(nums);
    }
    return out;
  }, [rows]);

  function updateCell(rowId, kpiKey, value) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, values: { ...r.values, [kpiKey]: value } }
          : r
      )
    );
  }

  // Para ficar “igual planilha”: bloco Produção Turnos só aparece UMA vez (rowSpan)
  const prodRowSpan = rows.length + 1; // +1 linha de MÉDIA

  return (
    <>
      <div className="header">
        <div>
          <div className="h1">KPI&apos;s Moagem - SHO</div>
          <div className="sub">Tela operacional idêntica ao layout da planilha.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="field" style={{ maxWidth: 220 }}>
            <label>DATA</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Turno</label>
            <select value={shift} onChange={(e) => changeShift(e.target.value)}>
              <option value="NOITE">NOITE</option>
              <option value="MANHÃ">MANHÃ</option>
              <option value="TARDE">TARDE</option>
            </select>
          </div>
          <div className="field" style={{ maxWidth: 260 }}>
            <label>Tipo De Farelo</label>
            <select value={farelo} onChange={(e) => setFarelo(e.target.value)}>
              {FARELO_TYPES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Janela do turno (Produção Turnos)</label>
            <input readOnly value={SHIFT_WINDOWS[shift]} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">Tabela (igual ao Excel)</div>

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th className="th" rowSpan={2}>DATA</th>
                <th className="th" rowSpan={2}>HORA</th>
                <th className="th" rowSpan={2}>Turno</th>
                <th className="th" rowSpan={2}>Tipo De Farelo</th>

                {KPI_GROUPS.map((g) => (
                  <th className="th" key={g.key} colSpan={2}>{g.title}</th>
                ))}

                <th className="th" colSpan={9}>Produção Turnos</th>
              </tr>

              <tr>
                {KPI_GROUPS.map((g) => (
                  <React.Fragment key={g.key}>
                    <th className="th">{g.execLabel}</th>
                    <th className="th">{g.metaLabel}</th>
                  </React.Fragment>
                ))}

                <th className="th">HORA</th>
                <th className="th">Turno</th>
                <th className="th">Executado</th>
                <th className="th">Meta</th>
                <th className="th">Desvio do KPI</th>
                <th className="th">Operador Responsável</th>
                <th className="th">Lider Responsável</th>
                <th className="th">Solução</th>
                <th className="th">Data de Conclusão</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className="tr">
                  <td className="td">{idx === 0 ? date : ""}</td>
                  <td className="td">{r.hora}</td>
                  <td className="td">{shift}</td>
                  <td className="td">{farelo}</td>

                  {KPI_GROUPS.map((g) => (
                    <React.Fragment key={g.key}>
                      <td className="td">
                        <input
                          value={r.values[g.key] ?? ""}
                          onChange={(e) => updateCell(r.id, g.key, e.target.value)}
                          placeholder=""
                        />
                      </td>
                      <td className="td">
                        <input
                          readOnly
                          value={g.metaText(farelo)}
                        />
                      </td>
                    </React.Fragment>
                  ))}

                  {/* Produção Turnos com rowspan no primeiro row (igual bloco lateral do Excel) */}
                  {idx === 0 && (
                    <>
                      <td className="td" rowSpan={prodRowSpan}>{SHIFT_WINDOWS[shift]}</td>
                      <td className="td" rowSpan={prodRowSpan}>{shift}</td>

                      <td className="td" rowSpan={prodRowSpan}>
                        <div className="small"><b>SOJA</b></div>
                        <input
                          value={prod.sojaExec}
                          onChange={(e) => setProd((p) => ({ ...p, sojaExec: e.target.value }))}
                          placeholder="Executado"
                        />
                        <div style={{ height: 8 }} />
                        <div className="small"><b>FARELO</b></div>
                        <input
                          value={prod.fareloExec}
                          onChange={(e) => setProd((p) => ({ ...p, fareloExec: e.target.value }))}
                          placeholder="Executado"
                        />
                      </td>

                      <td className="td" rowSpan={prodRowSpan}>
                        <div className="small"><b>SOJA</b></div>
                        <input
                          value={prod.sojaMeta}
                          onChange={(e) => setProd((p) => ({ ...p, sojaMeta: e.target.value }))}
                        />
                        <div style={{ height: 8 }} />
                        <div className="small"><b>FARELO</b></div>
                        <input
                          value={prod.fareloMeta}
                          onChange={(e) => setProd((p) => ({ ...p, fareloMeta: e.target.value }))}
                        />
                      </td>

                      <td className="td" rowSpan={prodRowSpan}>
                        <textarea
                          value={prod.desvio}
                          onChange={(e) => setProd((p) => ({ ...p, desvio: e.target.value }))}
                          placeholder=""
                        />
                      </td>
                      <td className="td" rowSpan={prodRowSpan}>
                        <input
                          value={prod.operador}
                          onChange={(e) => setProd((p) => ({ ...p, operador: e.target.value }))}
                          placeholder=""
                        />
                      </td>
                      <td className="td" rowSpan={prodRowSpan}>
                        <input
                          value={prod.lider}
                          onChange={(e) => setProd((p) => ({ ...p, lider: e.target.value }))}
                          placeholder=""
                        />
                      </td>
                      <td className="td" rowSpan={prodRowSpan}>
                        <textarea
                          value={prod.solucao}
                          onChange={(e) => setProd((p) => ({ ...p, solucao: e.target.value }))}
                          placeholder=""
                        />
                      </td>
                      <td className="td" rowSpan={prodRowSpan}>
                        <input
                          type="date"
                          value={prod.conclusao}
                          onChange={(e) => setProd((p) => ({ ...p, conclusao: e.target.value }))}
                        />
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {/* Linha MÉDIA (igual ao Excel) */}
              <tr className="tr">
                <td className="td"></td>
                <td className="td"><b>MÉDIA</b></td>
                <td className="td"></td>
                <td className="td"></td>

                {KPI_GROUPS.map((g) => (
                  <React.Fragment key={g.key}>
                    <td className="td"><b>{formatNumber(media[g.key])}</b></td>
                    <td className="td"></td>
                  </React.Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="btnRow">
          <button
            className="primary"
            onClick={() => alert("Próximo passo: salvar no localStorage exatamente como a planilha (1 registro por Data+Turno).")}
          >
            Salvar (placeholder)
          </button>
        </div>
      </div>
    </>
  );
}