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
  setupPerspectiveTabs();
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
    setupOperatorPerspective();
    initOperatorCharts();
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
      icon.className = 'fa-solid fa-moon';
      text.textContent = 'Modo Escuro';
    } else {
      icon.className = 'fa-solid fa-sun';
      text.textContent = 'Modo Claro';
    }

    // Atualiza temas dos gráficos
    Object.values(charts).forEach(c => {
      if (c) {
        if (c.options.scales?.x) {
          c.options.scales.x.grid.color = getGridColor();
          c.options.scales.x.ticks.color = getTextColor();
        }
        if (c.options.scales?.y) {
          c.options.scales.y.grid.color = getGridColor();
          c.options.scales.y.ticks.color = getTextColor();
          if (c.options.scales.y.title) c.options.scales.y.title.color = getTextColor();
        }
        if (c.options.scales?.y1) {
          if (c.options.scales.y1.grid) c.options.scales.y1.grid.color = getGridColor();
        }
        if (c.options.plugins?.legend?.labels) {
          c.options.plugins.legend.labels.color = getTextColor();
        }
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

  // 5. Gráfico Sazonalidade Mensal & Médias Diárias de Operação
  const ctxSazonal = document.getElementById('chartSazonalidade').getContext('2d');
  const mesesLabels = globalData.mensal_sazonal.map(m => m.mes_nome);
  const totaisMensais = globalData.mensal_sazonal.map(m => m.total);
  const mediasDiarias = globalData.mensal_sazonal.map(m => m.media_diaria);

  charts.sazonalidade = new Chart(ctxSazonal, {
    data: {
      labels: mesesLabels,
      datasets: [
        {
          type: 'bar',
          label: 'Total de Movimentos',
          data: totaisMensais,
          backgroundColor: 'rgba(56, 189, 248, 0.45)',
          borderColor: '#38bdf8',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Média Diária (voos/dia)',
          data: mediasDiarias,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          borderWidth: 3,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: getTextColor(), boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.yAxisID === 'y1') {
                return ` ${context.dataset.label}: ${context.raw} voos/dia`;
              }
              return ` ${context.dataset.label}: ${context.raw.toLocaleString('pt-BR')} movimentos`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: getGridColor() },
          ticks: { color: getTextColor() }
        },
        y: {
          type: 'linear',
          position: 'left',
          grid: { color: getGridColor() },
          ticks: {
            color: getTextColor(),
            callback: value => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value
          },
          title: {
            display: true,
            text: 'Total de Movimentos',
            color: getTextColor(),
            font: { size: 11 }
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          min: 50,
          max: 100,
          ticks: {
            color: '#f59e0b',
            callback: value => `${value}/d`
          },
          title: {
            display: true,
            text: 'Média Voos/Dia',
            color: '#f59e0b',
            font: { size: 11 }
          }
        }
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

// ==========================================================================
// PERSPECTIVA DE OPERADORES & GESTÃO DE FROTAS
// ==========================================================================

function setupPerspectiveTabs() {
  const tabs = document.querySelectorAll('.perspective-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
      });

      const activePane = document.getElementById(targetId);
      if (activePane) {
        activePane.style.display = 'flex';
        activePane.classList.add('active');
      }

      // Redimensionar gráficos para preencher o canvas na aba visível
      setTimeout(() => {
        Object.values(charts).forEach(c => {
          if (c) c.resize();
        });
      }, 50);
    });
  });
}

let opTableCurrentPage = 1;
const OP_TABLE_PAGE_SIZE = 10;
let filteredOperatorsList = [];

function setupOperatorPerspective() {
  if (!globalData || !globalData.kpis_operadores) return;

  const kpis = globalData.kpis_operadores;
  document.getElementById('kpiOpTotal').textContent = kpis.total_operadores;
  document.getElementById('kpiOpLider').textContent = kpis.top1_operador;
  document.getElementById('kpiOpLiderSub').textContent = `${kpis.top1_voos.toLocaleString('pt-BR')} movimentos no console (${kpis.top1_pct}% do tráfego)`;
  document.getElementById('kpiOpTop10').textContent = `${kpis.concentracao_top10}%`;
  document.getElementById('kpiOpMedia').textContent = `~${Math.round(kpis.media_por_operador).toLocaleString('pt-BR')}`;

  // Popular Select do Spotlight com os 101 controladores
  const select = document.getElementById('selectOperadorSpotlight');
  select.innerHTML = '';
  globalData.operadores_ranking.forEach(op => {
    const opt = document.createElement('option');
    opt.value = op.operador;
    opt.textContent = `#${op.ranking} - Controlador ${op.operador} (${op.total.toLocaleString('pt-BR')} movs - ${op.periodo_ativo || ''})`;
    select.appendChild(opt);
  });

  select.addEventListener('change', (e) => {
    updateOperatorSpotlight(e.target.value);
  });

  // Renderizar Spotlight inicial com o Top 1
  if (globalData.operadores_ranking.length > 0) {
    updateOperatorSpotlight(globalData.operadores_ranking[0].operador);
  }

  // Configurar Tabela dos 101 Controladores
  filteredOperatorsList = [...globalData.operadores_ranking];
  setupOperatorTableEvents();
  renderOperatorTable();
}

function updateOperatorSpotlight(opCode) {
  const op = globalData.operadores_ranking.find(o => o.operador === opCode);
  if (!op) return;

  document.getElementById('spotlightRank').textContent = `Ranking de Escala #${op.ranking}`;
  document.getElementById('spotlightCode').textContent = op.operador;
  document.getElementById('spotlightTotal').textContent = `${op.total.toLocaleString('pt-BR')} movimentos`;
  document.getElementById('spotlightPct').textContent = `${op.pct}% de todos os registros da TWR SBSJ`;
  document.getElementById('spotlightTv').textContent = op.tv_predominante;
  document.getElementById('spotlightCat').textContent = op.categoria_predominante;
  document.getElementById('spotlightTgl').textContent = `${op.pct_tgl}%`;
  document.getElementById('spotlightLocal').textContent = op.periodo_ativo || 'Escala Ativa';
  
  const elTurno = document.getElementById('spotlightTurno');
  if (elTurno) {
    elTurno.textContent = `${op.turno_predominante || 'Vespertino'} (${op.pct_turno || 0}% dos turnos)`;
  }

  document.getElementById('spotlightFrota').textContent = `${op.total_aeronaves.toLocaleString('pt-BR')} aeronaves distintas`;
  document.getElementById('spotlightModelosQtd').textContent = `${op.total_modelos} modelos distintos atendidos`;

  // Renderizar Top Aeronaves Coordenadas
  const modelsContainer = document.getElementById('spotlightModelsList');
  modelsContainer.innerHTML = '';
  op.modelos_top.forEach(m => {
    const item = document.createElement('div');
    item.className = 'model-bar-item';
    item.innerHTML = `
      <div class="model-bar-header">
        <span>${m.modelo}</span>
        <span style="color: var(--accent-cyan);">${m.total.toLocaleString('pt-BR')} (${m.pct}%)</span>
      </div>
      <div class="model-progress-bg">
        <div class="model-progress-fill" style="width: ${Math.min(m.pct * 2.5, 100)}%;"></div>
      </div>
    `;
    modelsContainer.appendChild(item);
  });

  // Diagnóstico Narrativo Automatizado do Controlador
  let diag = `O controlador <strong>${op.operador}</strong> ocupa a <strong>${op.ranking}ª posição na escala histórica</strong> da TWR SBSJ, tendo gerenciado <strong>${op.total.toLocaleString('pt-BR')} movimentos em console</strong> (${op.pct}% de toda a base histórica). `;
  diag += `Esteve em atividade na escala do aeródromo no período de <strong>${op.periodo_ativo || 'múltiplos anos'}</strong>, com maior densidade de serviço no <strong>${op.turno_predominante || 'período vespertino'}</strong> (${op.pct_turno || 0}% de seus registros). `;
  if (op.pct_tgl > 25) {
    diag += `Apresenta expressiva carga de trabalho na <em>coordenação de voos de instrução no circuito de tráfego visual</em>, com <strong>${op.pct_tgl}% das operações sob sua fonia correspondendo a toques e arremetidas (TGL)</strong>. `;
  } else {
    diag += `Coordenou predominantemente <em>operações em rota, partidas e chegadas</em> no espaço aéreo terminal. `;
  }
  diag += `Sob sua vigilância e autorizações de controle, foram coordenadas <strong>${op.total_aeronaves.toLocaleString('pt-BR')} aeronaves distintas</strong> de <strong>${op.total_modelos} modelos aeronáuticos</strong>.`;
  document.getElementById('spotlightSummary').innerHTML = diag;
}

function initOperatorCharts() {
  if (!globalData || !globalData.operadores_ranking) return;

  // 1. Gráfico Ranking Top 15 Controladores
  const ctxOpRanking = document.getElementById('chartOpRanking').getContext('2d');
  const top15 = globalData.operadores_ranking.slice(0, 15);
  charts.opRanking = new Chart(ctxOpRanking, {
    type: 'bar',
    data: {
      labels: top15.map(o => `#${o.ranking} ${o.operador}`),
      datasets: [{
        label: 'Movimentos no Console',
        data: top15.map(o => o.total),
        backgroundColor: '#06b6d4',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const op = top15[ctx.dataIndex];
              return ` ${ctx.raw.toLocaleString('pt-BR')} movimentos (${op.pct}% do volume da torre)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { grid: { display: false }, ticks: { color: getTextColor(), font: { family: 'monospace', weight: 'bold' } } }
      }
    }
  });

  // 2. Gráfico Evolução Temporal dos Top 5 Controladores
  const ctxOpEvol = document.getElementById('chartOpEvolucao').getContext('2d');
  const evolData = globalData.operadores_evolucao_anual;
  const colorsTop5 = ['#06b6d4', '#f59e0b', '#6366f1', '#10b981', '#f43f5e'];
  const datasetsEvol = Object.keys(evolData.series).map((op, idx) => ({
    label: `Controlador ${op}`,
    data: evolData.series[op],
    borderColor: colorsTop5[idx % colorsTop5.length],
    backgroundColor: colorsTop5[idx % colorsTop5.length],
    borderWidth: 2.5,
    tension: 0.3,
    pointRadius: 3
  }));

  charts.opEvolucao = new Chart(ctxOpEvol, {
    type: 'line',
    data: {
      labels: evolData.anos,
      datasets: datasetsEvol
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: getTextColor(), boxWidth: 12 } }
      },
      scales: {
        x: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      }
    }
  });

  // 3. Gráfico Mix de Categorias Coordenadas (Top 10)
  const ctxOpFrotas = document.getElementById('chartOpFrotas').getContext('2d');
  const frotasData = globalData.operadores_frotas_top10;
  const coresCat = {
    'Treinamento / Monomotor': '#06b6d4',
    'Helicóptero': '#f59e0b',
    'Turboélice / Regional': '#10b981',
    'Jato (Executivo / Comercial)': '#6366f1',
    'Bimotor Pistão': '#ec4899',
    'Outros / Especiais': '#64748b'
  };

  const datasetsFrotas = Object.keys(frotasData.categorias).map(cat => ({
    label: cat,
    data: frotasData.categorias[cat],
    backgroundColor: coresCat[cat] || '#94a3b8'
  }));

  charts.opFrotas = new Chart(ctxOpFrotas, {
    type: 'bar',
    data: {
      labels: frotasData.operadores,
      datasets: datasetsFrotas
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { stacked: true, grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      },
      plugins: {
        legend: { labels: { color: getTextColor(), boxWidth: 10, font: { size: 10 } } }
      }
    }
  });

  // 4. Gráfico Tipos de Tráfego Gerenciados (Top 10)
  const ctxOpMissoes = document.getElementById('chartOpMissoes').getContext('2d');
  const missoesData = globalData.operadores_missoes_top10;
  const coresMissoes = {
    'Aviação Geral / Civil': '#3b82f6',
    'Militar': '#10b981',
    'Comercial Regular': '#f59e0b',
    'Experimental': '#ec4899',
    'Não Regular': '#8b5cf6'
  };

  const datasetsMissoes = Object.keys(missoesData.missoes).map(m => ({
    label: m,
    data: missoesData.missoes[m],
    backgroundColor: coresMissoes[m] || '#06b6d4'
  }));

  charts.opMissoes = new Chart(ctxOpMissoes, {
    type: 'bar',
    data: {
      labels: missoesData.operadores,
      datasets: datasetsMissoes
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: getGridColor() }, ticks: { color: getTextColor() } },
        y: { stacked: true, grid: { color: getGridColor() }, ticks: { color: getTextColor() } }
      },
      plugins: {
        legend: { labels: { color: getTextColor(), boxWidth: 10, font: { size: 10 } } }
      }
    }
  });
}

function setupOperatorTableEvents() {
  const searchInput = document.getElementById('opTableSearchInput');
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
      filteredOperatorsList = [...globalData.operadores_ranking];
    } else {
      filteredOperatorsList = globalData.operadores_ranking.filter(o => 
        o.operador.toLowerCase().includes(term) ||
        (o.turno_predominante && o.turno_predominante.toLowerCase().includes(term)) ||
        o.categoria_predominante.toLowerCase().includes(term) ||
        o.tv_predominante.toLowerCase().includes(term) ||
        (o.modelos_top[0] && o.modelos_top[0].modelo.toLowerCase().includes(term))
      );
    }
    opTableCurrentPage = 1;
    renderOperatorTable();
  });

  document.getElementById('btnPrevOpPage').addEventListener('click', () => {
    if (opTableCurrentPage > 1) {
      opTableCurrentPage--;
      renderOperatorTable();
    }
  });

  document.getElementById('btnNextOpPage').addEventListener('click', () => {
    const maxPage = Math.ceil(filteredOperatorsList.length / OP_TABLE_PAGE_SIZE);
    if (opTableCurrentPage < maxPage) {
      opTableCurrentPage++;
      renderOperatorTable();
    }
  });
}

function renderOperatorTable() {
  const tbody = document.getElementById('opTableBody');
  const info = document.getElementById('opTableInfo');
  const btnPrev = document.getElementById('btnPrevOpPage');
  const btnNext = document.getElementById('btnNextOpPage');

  tbody.innerHTML = '';
  const total = filteredOperatorsList.length;
  const maxPage = Math.ceil(total / OP_TABLE_PAGE_SIZE) || 1;
  const start = (opTableCurrentPage - 1) * OP_TABLE_PAGE_SIZE;
  const pageItems = filteredOperatorsList.slice(start, start + OP_TABLE_PAGE_SIZE);

  info.textContent = `Exibindo ${pageItems.length ? start + 1 : 0} a ${Math.min(start + OP_TABLE_PAGE_SIZE, total)} de ${total} controladores (Página ${opTableCurrentPage} de ${maxPage})`;
  btnPrev.disabled = opTableCurrentPage <= 1;
  btnNext.disabled = opTableCurrentPage >= maxPage;

  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum controlador encontrado com este termo.</td></tr>';
    return;
  }

  pageItems.forEach(o => {
    const tr = document.createElement('tr');
    const topModStr = o.modelos_top[0] ? `${o.modelos_top[0].modelo} (${o.modelos_top[0].pct}%)` : '-';
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--accent-amber);">#${o.ranking}</td>
      <td><span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); font-size: 0.85rem;"><i class="fa-solid fa-headset" style="font-size: 0.72rem; margin-right: 4px;"></i>${o.operador}</span></td>
      <td style="font-weight: 600;">${o.total.toLocaleString('pt-BR')}</td>
      <td><span style="color: var(--accent-indigo); font-weight: 600;">${o.pct}%</span></td>
      <td style="font-size: 0.82rem;">${o.periodo_ativo || '-'}</td>
      <td><span class="badge" style="background: rgba(255, 255, 255, 0.08); font-size: 0.75rem;">${o.turno_predominante || '-'}</span></td>
      <td>${topModStr}</td>
      <td>${o.pct_tgl}%</td>
      <td>${o.total_aeronaves.toLocaleString('pt-BR')}</td>
      <td>
        <button class="btn-inspect-op" data-code="${o.operador}">
          <i class="fa-solid fa-magnifying-glass-chart"></i> Raio-X
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Eventos dos botões "Raio-X" na tabela
  tbody.querySelectorAll('.btn-inspect-op').forEach(btn => {
    btn.addEventListener('click', () => {
      const opCode = btn.getAttribute('data-code');
      const select = document.getElementById('selectOperadorSpotlight');
      select.value = opCode;
      updateOperatorSpotlight(opCode);
      document.getElementById('operatorSpotlightCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
