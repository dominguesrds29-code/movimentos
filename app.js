/**
 * SBSJ Data Mining & Analytics Dashboard
 * Algoritmos de filtragem dinâmica, inferências estatísticas e renderização reativa
 */

let globalData = null;
let charts = {};
let tableCurrentPage = 1;
const TABLE_PAGE_SIZE = 12;
let filteredSampleData = [];

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  setupThemeToggle();
  setupFilterEvents();
  setupTableEvents();
  
  try {
    const res = await fetch('./analise_dados.json');
    if (!res.ok) throw new Error('Não foi possível carregar analise_dados.json');
    globalData = await res.json();

    populateYearFilter(globalData.anual);
    renderMiningRules(globalData.regras_mineracao);
    renderClusters(globalData.clusters);
    renderAnomalies(globalData.anomalias);
    
    filteredSampleData = [...globalData.amostra];
    renderTable();

    initCharts();
    updateDashboard();
  } catch (err) {
    console.error('Erro ao inicializar:', err);
    alert('Erro ao carregar dados analíticos. Verifique se analise_dados.json está no mesmo diretório.');
  }
});

// Configuração de Tema Dark/Light
function setupThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  const html = document.documentElement;

  btn.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);

    if (newTheme === 'light') {
      icon.className = 'fa-solid fa-sun';
      text.textContent = 'Modo Escuro';
    } else {
      icon.className = 'fa-solid fa-moon';
      text.textContent = 'Modo Claro';
    }

    // Atualiza temas dos gráficos
    Object.values(charts).forEach(c => {
      if (c) {
        c.options.scales?.x && (c.options.scales.x.grid.color = getGridColor());
        c.options.scales?.y && (c.options.scales.y.grid.color = getGridColor());
        c.update();
      }
    });
  });
}

function getGridColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'rgba(75, 85, 99, 0.2)'
    : 'rgba(203, 213, 225, 0.5)';
}

function getTextColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? '#9ca3af'
    : '#64748b';
}

// Popular Filtro de Anos
function populateYearFilter(anual) {
  const select = document.getElementById('filterAno');
  anual.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.ano;
    opt.textContent = `Ano ${item.ano} (${item.total.toLocaleString('pt-BR')} movimentos)`;
    select.appendChild(opt);
  });
}

// Eventos de Filtro
function setupFilterEvents() {
  const filters = ['filterAno', 'filterTv', 'filterOperacao', 'filterPista', 'filterCategoria'];
  filters.forEach(id => {
    document.getElementById(id).addEventListener('change', updateDashboard);
  });

  document.getElementById('btnResetFilters').addEventListener('click', () => {
    filters.forEach(id => {
      document.getElementById(id).value = 'ALL';
    });
    updateDashboard();
  });
}

// Atualização Reativa do Dashboard
function updateDashboard() {
  if (!globalData) return;

  const filterAno = document.getElementById('filterAno').value;
  const filterTv = document.getElementById('filterTv').value;
  const filterOperacao = document.getElementById('filterOperacao').value;
  const filterPista = document.getElementById('filterPista').value;
  const filterCategoria = document.getElementById('filterCategoria').value;

  // Filtragem no Cubo OLAP agregado
  let cubo = globalData.cubo;

  if (filterAno !== 'ALL') {
    const anoNum = parseInt(filterAno);
    cubo = cubo.filter(r => r.ano === anoNum);
  }
  if (filterTv !== 'ALL') {
    cubo = cubo.filter(r => r.tv === filterTv);
  }
  if (filterOperacao !== 'ALL') {
    cubo = cubo.filter(r => r.operacao === filterOperacao);
  }
  if (filterPista !== 'ALL') {
    if (filterPista === '15_16') {
      cubo = cubo.filter(r => r.rwy === '15' || r.rwy === '16');
    } else if (filterPista === '33_34') {
      cubo = cubo.filter(r => r.rwy === '33' || r.rwy === '34');
    } else if (filterPista === '0') {
      cubo = cubo.filter(r => r.rwy === '0');
    }
  }
  if (filterCategoria !== 'ALL') {
    cubo = cubo.filter(r => r.categoria_aero === filterCategoria);
  }

  // Métricas dinâmicas a partir do subconjunto filtrado
  let totalFiltrado = 0;
  let totalTGL = 0;
  let totalPista15_16 = 0;

  cubo.forEach(r => {
    totalFiltrado += r.count;
    if (r.operacao === 'TGL') totalTGL += r.count;
    if (r.rwy === '15' || r.rwy === '16') totalPista15_16 += r.count;
  });

  const pctGlobal = ((totalFiltrado / globalData.kpis.total_movimentos) * 100).toFixed(1);
  const pctTGL = totalFiltrado > 0 ? ((totalTGL / totalFiltrado) * 100).toFixed(1) : 0;
  const pctPista = totalFiltrado > 0 ? ((totalPista15_16 / totalFiltrado) * 100).toFixed(1) : 0;

  // Dias ativos estimados
  const anosQtd = filterAno === 'ALL' ? globalData.kpis.total_anos : 1;
  const mediaDiaCalc = (totalFiltrado / (anosQtd * 365)).toFixed(1);

  // Atualizar DOM dos KPIs
  document.getElementById('kpiTotal').textContent = totalFiltrado.toLocaleString('pt-BR');
  document.getElementById('kpiPctGlobal').textContent = `${pctGlobal}% dos movimentos históricos`;
  document.getElementById('kpiTGL').textContent = `${pctTGL}% (${totalTGL.toLocaleString('pt-BR')})`;
  document.getElementById('kpiVFR').textContent = `${globalData.kpis.pct_visual}%`;
  document.getElementById('kpiPista').textContent = `${pctPista}%`;
  document.getElementById('kpiMediaDia').textContent = `${mediaDiaCalc}/dia`;

  // Atualizar Gráfico de Operações conforme filtros
  updateOperacoesChart(cubo);

  // Filtrar dados da tabela de amostra
  filterSampleTable(filterAno, filterTv, filterOperacao, filterPista, filterCategoria);
}

// Inicialização dos Gráficos com Chart.js
function initCharts() {
  // 1. Gráfico Série Histórica Anual
  const ctxAnual = document.getElementById('chartEvolucaoAnual').getContext('2d');
  const anosLabels = globalData.anual.map(a => a.ano);
  const anosTotais = globalData.anual.map(a => a.total);
  const anosTGL = globalData.anual.map(a => a.tgl);

  charts.anual = new Chart(ctxAnual, {
    type: 'line',
    data: {
      labels: anosLabels,
      datasets: [
        {
          label: 'Total de Movimentos',
          data: anosTotais,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#06b6d4'
        },
        {
          label: 'Toques e Arremetidas (TGL)',
          data: anosTGL,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          pointBackgroundColor: '#f59e0b'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getTextColor(), font: { family: 'Inter' } } }
      },
      scales: {
        x: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      }
    }
  });

  // 2. Gráfico Distribuição Horária
  const ctxHorario = document.getElementById('chartHorario').getContext('2d');
  const horasLabels = globalData.horario_local.map(h => `${String(h.hora_local).padStart(2, '0')}:00`);
  const horasTotais = globalData.horario_local.map(h => h.total);

  charts.horario = new Chart(ctxHorario, {
    type: 'bar',
    data: {
      labels: horasLabels,
      datasets: [{
        label: 'Movimentos por Hora',
        data: horasTotais,
        backgroundColor: horasLabels.map(h => {
          const val = parseInt(h);
          return (val >= 9 && val <= 17) ? '#3b82f6' : '#64748b';
        }),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: getTextColor(), maxRotation: 45 } },
        y: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      }
    }
  });

  // 3. Gráfico de Operações (Doughnut)
  const ctxOperacoes = document.getElementById('chartOperacoes').getContext('2d');
  charts.operacoes = new Chart(ctxOperacoes, {
    type: 'doughnut',
    data: {
      labels: globalData.operacoes.slice(0, 6).map(o => o.operacao),
      datasets: [{
        data: globalData.operacoes.slice(0, 6).map(o => o.total),
        backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#f43f5e', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: getTextColor(), boxWidth: 14 } }
      },
      cutout: '68%'
    }
  });

  // 4. Gráfico Top Aeronaves
  const ctxAero = document.getElementById('chartAeronaves').getContext('2d');
  const top10Aero = globalData.top_modelos.slice(0, 10);
  charts.aeronaves = new Chart(ctxAero, {
    type: 'bar',
    data: {
      labels: top10Aero.map(a => a.tipo),
      datasets: [{
        label: 'Operações',
        data: top10Aero.map(a => a.total),
        backgroundColor: '#6366f1',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { grid: { display: false }, ticks: { color: getTextColor() } }
      }
    }
  });

  // 5. Gráfico Transição Histórica de Pistas (Declinação Magnética 15->16 e 33->34)
  const ctxPistas = document.getElementById('chartPistasTransicao').getContext('2d');
  const anosPistas = Object.keys(globalData.pistas_anuais);
  const p15 = anosPistas.map(ano => globalData.pistas_anuais[ano]['15.0'] || 0);
  const p16 = anosPistas.map(ano => globalData.pistas_anuais[ano]['16.0'] || 0);
  const p33 = anosPistas.map(ano => globalData.pistas_anuais[ano]['33.0'] || 0);
  const p34 = anosPistas.map(ano => globalData.pistas_anuais[ano]['34.0'] || 0);

  charts.pistas = new Chart(ctxPistas, {
    type: 'line',
    data: {
      labels: anosPistas,
      datasets: [
        { label: 'Pista 15 (Antiga)', data: p15, borderColor: '#f43f5e', borderWidth: 2, tension: 0.2 },
        { label: 'Pista 16 (Atual)', data: p16, borderColor: '#10b981', borderWidth: 3, tension: 0.2 },
        { label: 'Pista 33 (Antiga)', data: p33, borderColor: '#fbbf24', borderDash: [4, 4], borderWidth: 1.5 },
        { label: 'Pista 34 (Atual)', data: p34, borderColor: '#3b82f6', borderDash: [4, 4], borderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getTextColor(), boxWidth: 12 } }
      },
      scales: {
        x: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      }
    }
  });

  // 6. Gráfico Top Rotas Inter-aeroportos
  const ctxRotas = document.getElementById('chartRotas').getContext('2d');
  const topRotas = globalData.top_rotas.slice(0, 8);
  charts.rotas = new Chart(ctxRotas, {
    type: 'bar',
    data: {
      labels: topRotas.map(r => `${r.proced} ➔ ${r.dest}`),
      datasets: [{
        label: 'Voos Conectados',
        data: topRotas.map(r => r.total),
        backgroundColor: '#06b6d4',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: getTextColor(), maxRotation: 30 } },
        y: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      }
    }
  });
}

// Atualizar Gráfico de Operações com base nos filtros
function updateOperacoesChart(cubo) {
  if (!charts.operacoes) return;

  const opsCount = {};
  cubo.forEach(r => {
    opsCount[r.operacao] = (opsCount[r.operacao] || 0) + r.count;
  });

  const sortedOps = Object.entries(opsCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  charts.operacoes.data.labels = sortedOps.map(s => s[0]);
  charts.operacoes.data.datasets[0].data = sortedOps.map(s => s[1]);
  charts.operacoes.update();
}

// Renderizar Regras de Associação Mineradas
function renderMiningRules(rules) {
  const container = document.getElementById('rulesContainer');
  container.innerHTML = '';

  rules.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rule-item';
    item.innerHTML = `
      <div class="rule-header">
        <div class="rule-chips">
          <span class="chip chip-sup">Suporte: ${r.suporte}</span>
          <span class="chip chip-conf">Confiança: ${r.confianca}</span>
          <span class="chip chip-lift">Lift: ${r.lift}</span>
        </div>
      </div>
      <div class="rule-statement">
        <span style="color: var(--accent-cyan);">${r.antecedente}</span> &nbsp;&Longrightarrow;&nbsp; 
        <span style="color: var(--accent-amber);">${r.consequente}</span>
      </div>
      <div class="rule-desc">${r.interpretacao}</div>
    `;
    container.appendChild(item);
  });
}

// Renderizar Clusters K-Means
function renderClusters(clusters) {
  const container = document.getElementById('clustersContainer');
  container.innerHTML = '';

  clusters.forEach(c => {
    const item = document.createElement('div');
    item.className = `cluster-item c${c.id}`;
    item.innerHTML = `
      <div class="cluster-title">
        <span>Cluster ${c.id}: ${c.nome}</span>
        <span class="chip chip-sup">${c.pct_dias}% dos dias (${c.dias} d)</span>
      </div>
      <div class="cluster-desc">${c.caracteristicas}</div>
    `;
    container.appendChild(item);
  });
}

// Renderizar Detecção de Anomalias Estatísticas
function renderAnomalies(anomalias) {
  const container = document.getElementById('anomaliesContainer');
  container.innerHTML = '';

  anomalias.forEach(a => {
    const box = document.createElement('div');
    box.className = 'insight-box';
    const isPico = a.tipo.includes('Pico');
    const color = isPico ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    const icon = isPico ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

    box.innerHTML = `
      <h4 style="color: ${color};">
        <i class="fa-solid ${icon}"></i> ${a.data} &bull; ${a.voos} voos
      </h4>
      <div style="font-size: 0.75rem; font-weight: 700; color: ${color}; margin-bottom: 0.35rem;">${a.tipo}</div>
      <p>${a.detalhe}</p>
    `;
    container.appendChild(box);
  });
}

// Filtro e Paginação da Tabela de Amostra
function setupTableEvents() {
  const searchInput = document.getElementById('tableSearchInput');
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!globalData) return;

    if (!term) {
      filteredSampleData = [...globalData.amostra];
    } else {
      filteredSampleData = globalData.amostra.filter(r => 
        (r.identificacao && r.identificacao.toLowerCase().includes(term)) ||
        (r.tipo && r.tipo.toLowerCase().includes(term)) ||
        (r.operador && r.operador.toLowerCase().includes(term)) ||
        (r.proced && r.proced.toLowerCase().includes(term)) ||
        (r.dest && r.dest.toLowerCase().includes(term)) ||
        (r.operacao && r.operacao.toLowerCase().includes(term))
      );
    }
    tableCurrentPage = 1;
    renderTable();
  });

  document.getElementById('btnPrevPage').addEventListener('click', () => {
    if (tableCurrentPage > 1) {
      tableCurrentPage--;
      renderTable();
    }
  });

  document.getElementById('btnNextPage').addEventListener('click', () => {
    const maxPage = Math.ceil(filteredSampleData.length / TABLE_PAGE_SIZE);
    if (tableCurrentPage < maxPage) {
      tableCurrentPage++;
      renderTable();
    }
  });
}

function filterSampleTable(ano, tv, operacao, pista, categoria) {
  if (!globalData) return;
  const term = document.getElementById('tableSearchInput').value.toLowerCase().trim();

  filteredSampleData = globalData.amostra.filter(r => {
    if (ano !== 'ALL' && !r.ddata_str.endsWith(ano)) return false;
    if (tv !== 'ALL' && r.tv !== tv) return false;
    if (operacao !== 'ALL' && r.operacao !== operacao) return false;
    if (pista !== 'ALL') {
      if (pista === '15_16' && (r.rwy !== '15' && r.rwy !== '16')) return false;
      if (pista === '33_34' && (r.rwy !== '33' && r.rwy !== '34')) return false;
      if (pista === '0' && r.rwy !== '0') return false;
    }
    if (categoria !== 'ALL' && r.categoria_aero !== categoria) return false;

    if (term) {
      const matchTerm = (r.identificacao && r.identificacao.toLowerCase().includes(term)) ||
                        (r.tipo && r.tipo.toLowerCase().includes(term)) ||
                        (r.operador && r.operador.toLowerCase().includes(term)) ||
                        (r.proced && r.proced.toLowerCase().includes(term)) ||
                        (r.dest && r.dest.toLowerCase().includes(term));
      if (!matchTerm) return false;
    }
    return true;
  });

  tableCurrentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const info = document.getElementById('tableInfo');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');

  tbody.innerHTML = '';

  const total = filteredSampleData.length;
  const maxPage = Math.ceil(total / TABLE_PAGE_SIZE) || 1;
  const start = (tableCurrentPage - 1) * TABLE_PAGE_SIZE;
  const pageItems = filteredSampleData.slice(start, start + TABLE_PAGE_SIZE);

  info.textContent = `Exibindo ${pageItems.length ? start + 1 : 0} a ${Math.min(start + TABLE_PAGE_SIZE, total)} de ${total} registros (Página ${tableCurrentPage} de ${maxPage})`;
  btnPrev.disabled = tableCurrentPage <= 1;
  btnNext.disabled = tableCurrentPage >= maxPage;

  if (pageItems.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="13" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum movimento encontrado para os filtros selecionados.</td>`;
    tbody.appendChild(tr);
    return;
  }

  pageItems.forEach(r => {
    const tr = document.createElement('tr');
    
    // Cor do badge de operação
    let badgeClass = 'badge-dep';
    if (r.operacao === 'ARR') badgeClass = 'badge-arr';
    else if (r.operacao === 'TGL') badgeClass = 'badge-tgl';
    else if (r.operacao === 'QAF') badgeClass = 'badge-qaf';
    else if (r.operacao === 'LOW') badgeClass = 'badge-low';

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 600;">${r.id}</td>
      <td>${r.ddata_str}</td>
      <td style="font-family: var(--font-mono);">${r.horario}</td>
      <td style="font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);">${r.identificacao}</td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${r.tipo}</td>
      <td><span style="font-size: 0.78rem; opacity: 0.85;">${r.categoria_aero}</span></td>
      <td><span class="badge" style="background: rgba(255,255,255,0.1);">${r.tv}</span></td>
      <td style="font-family: var(--font-mono);">${r.proced}</td>
      <td style="font-family: var(--font-mono);">${r.dest}</td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${r.rwy || '-'}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.08);">${r.rvoo}</span></td>
      <td><span class="badge ${badgeClass}">${r.operacao}</span></td>
      <td style="font-family: var(--font-mono); color: var(--text-muted);">${r.operador}</td>
    `;
    tbody.appendChild(tr);
  });
}
