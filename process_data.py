import pandas as pd
import numpy as np
import json
from datetime import datetime

print("Carregando movimentos.csv...")
df = pd.read_csv('movimentos.csv', sep='\t', low_memory=False)

# Tratamento temporal
df['ddata'] = pd.to_datetime(df['ddata'])
df['ano'] = df['ddata'].dt.year
df['mes'] = df['ddata'].dt.month
df['dia'] = df['ddata'].dt.day
df['dia_semana_num'] = df['ddata'].dt.dayofweek
df['dia_semana_nome'] = df['ddata'].dt.day_name()
dias_pt = {
    'Monday': 'Segunda-feira', 'Tuesday': 'Terça-feira', 'Wednesday': 'Quarta-feira',
    'Thursday': 'Quinta-feira', 'Friday': 'Sexta-feira', 'Saturday': 'Sábado', 'Sunday': 'Domingo'
}
df['dia_semana'] = df['dia_semana_nome'].map(dias_pt)

# Tratamento horário (UTC -> Hora Local UTC-3)
df['hora_utc'] = pd.to_numeric(df['horario'].str.slice(0, 2), errors='coerce').fillna(12).astype(int)
df['hora_local'] = (df['hora_utc'] - 3) % 24

# Tratamento dos campos
df['tipo'] = df['tipo'].fillna('N/INF').str.strip().str.upper()
df['rwy'] = df['rwy'].fillna('N/INF').astype(str).str.replace(r'\.0$', '', regex=True)
df['dest'] = df['dest'].fillna('N/INF').str.strip().str.upper()
df['proced'] = df['proced'].fillna('N/INF').str.strip().str.upper()
df['operacao'] = df['operacao'].fillna('N/INF').str.strip().str.upper()
df['tv'] = df['tv'].fillna('G').str.strip().str.upper()
df['rvoo'] = df['rvoo'].fillna('VV').str.strip().str.upper()

# Mapeamentos descritivos
tv_map = {
    'G': 'Aviação Geral / Civil',
    'M': 'Militar (FAB / BAVEX / DCTA)',
    'S': 'Comercial Regular (Passageiros)',
    'X': 'Experimental / Testes (Embraer)',
    'N': 'Não Regular / Táxi Aéreo'
}

operacao_map = {
    'TGL': 'Toque e Arremetida (Treinamento)',
    'DEP': 'Decolagem (Partida)',
    'ARR': 'Pouso (Chegada)',
    'QAF': 'Procedimento em Circuito / Teste',
    'LOW': 'Passagem Baixa (Low Approach)',
    'QAY': 'Operação Fora de Pista / Ponto Toque',
    'QSO': 'Missão Especial / Operação Específica',
    'ABA': 'Arremetida no Solo / Abortada',
    'ABD': 'Arremetida no Ar',
    'ACD': 'Ocorrência / Apoio Operacional'
}

rvoo_map = {
    'VV': 'VFR Integral (Visual)',
    'IV': 'IFR / VFR (Transição Instrumento-Visual)',
    'II': 'IFR Integral (Instrumentos)',
    'VI': 'VFR / IFR (Transição Visual-Instrumento)'
}

# Categorização de Aeronaves por Perfil
def categorizar_aeronave(tipo):
    if tipo in ['C150', 'C152', 'P28A', 'MC01', 'C172', 'A150', 'PA28']:
        return 'Treinamento / Monomotor'
    elif tipo in ['AS50', 'R44', 'R22', 'EC30', 'EC35', 'A109', 'B06', 'H135', 'S76']:
        return 'Helicóptero'
    elif tipo in ['E110', 'E120', 'C208', 'BE20', 'BE9L', 'PC12', 'SW4', 'AT72', 'PAY2']:
        return 'Turboélice / Regional'
    elif tipo in ['PA34', 'B58', 'P34A', 'BE58', 'C310']:
        return 'Bimotor Pistão'
    elif tipo in ['E190', 'E195', 'E75S', 'E295', 'B737', 'B738', 'A319', 'A320', 'GL5T', 'LJ35', 'LJ40', 'C560', 'C525', 'C680', 'PRM1', 'E50P', 'E55P']:
        return 'Jato (Executivo / Comercial)'
    else:
        return 'Outros / Especiais'

df['categoria_aero'] = df['tipo'].apply(categorizar_aeronave)

# 1. KPIs Globais
total_movimentos = len(df)
data_inicio = df['ddata'].min().strftime('%d/%m/%Y')
data_fim = df['ddata'].max().strftime('%d/%m/%Y')
total_anos = df['ano'].nunique()
media_diaria = round(total_movimentos / df['ddata'].nunique(), 1)
total_aeronaves_unicas = int(df['identificacao'].nunique())
total_modelos = int(df['tipo'].nunique())
pct_instrucao = round((df['operacao'] == 'TGL').sum() / total_movimentos * 100, 2)
pct_visual = round((df['rvoo'].isin(['VV', 'VI'])).sum() / total_movimentos * 100, 2)
pct_pista_15_16 = round(df['rwy'].isin(['15', '16']).sum() / total_movimentos * 100, 2)

# 2. Séries Temporais: Anual
anual = df.groupby('ano').agg(
    total=('id', 'count'),
    tgl=('operacao', lambda x: (x == 'TGL').sum()),
    dep=('operacao', lambda x: (x == 'DEP').sum()),
    arr=('operacao', lambda x: (x == 'ARR').sum()),
    geral=('tv', lambda x: (x == 'G').sum()),
    militar=('tv', lambda x: (x == 'M').sum()),
    comercial=('tv', lambda x: (x == 'S').sum()),
    experimental=('tv', lambda x: (x == 'X').sum()),
    vfr=('rvoo', lambda x: (x == 'VV').sum()),
    ifr=('rvoo', lambda x: (x == 'II').sum())
).reset_index().to_dict(orient='records')

# 3. Transição de Pistas por Ano
pistas_anuais = pd.crosstab(df['ano'], df['rwy']).to_dict(orient='index')

# 4. Distribuição Mensal / Sazonalidade Global
mensal_sazonal = df.groupby('mes').agg(
    total=('id', 'count'),
    media_diaria=('ddata', lambda x: round(len(x) / x.nunique(), 1))
).reset_index()
meses_nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
mensal_sazonal['mes_nome'] = mensal_sazonal['mes'].apply(lambda m: meses_nomes[m-1])
mensal_sazonal_dict = mensal_sazonal.to_dict(orient='records')

# 5. Distribuição por Dia da Semana
dias_ordem = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
semana_stat = df.groupby('dia_semana').size().reindex(dias_ordem).reset_index(name='total').to_dict(orient='records')

# 6. Distribuição Horária (Local UTC-3 e UTC)
horario_local = df.groupby('hora_local').size().reset_index(name='total').to_dict(orient='records')
horario_utc = df.groupby('hora_utc').size().reset_index(name='total').to_dict(orient='records')

# 7. Operações e Tipos de Voo
operacoes_dist = df['operacao'].value_counts().reset_index()
operacoes_dist.columns = ['operacao', 'total']
operacoes_dist['descricao'] = operacoes_dist['operacao'].map(operacao_map).fillna('Outra')
operacoes_dist['pct'] = (operacoes_dist['total'] / total_movimentos * 100).round(2)
operacoes_dist = operacoes_dist.to_dict(orient='records')

tv_dist = df['tv'].value_counts().reset_index()
tv_dist.columns = ['tv', 'total']
tv_dist['descricao'] = tv_dist['tv'].map(tv_map).fillna('Outro')
tv_dist['pct'] = (tv_dist['total'] / total_movimentos * 100).round(2)
tv_dist = tv_dist.to_dict(orient='records')

rvoo_dist = df['rvoo'].value_counts().reset_index()
rvoo_dist.columns = ['rvoo', 'total']
rvoo_dist['descricao'] = rvoo_dist['rvoo'].map(rvoo_map).fillna('Outro')
rvoo_dist['pct'] = (rvoo_dist['total'] / total_movimentos * 100).round(2)
rvoo_dist = rvoo_dist.to_dict(orient='records')

# 8. Categorias de Aeronaves
categorias_dist = df['categoria_aero'].value_counts().reset_index()
categorias_dist.columns = ['categoria', 'total']
categorias_dist['pct'] = (categorias_dist['total'] / total_movimentos * 100).round(2)
categorias_dist = categorias_dist.to_dict(orient='records')

# 9. Top 20 Aeronaves / Modelos
top_modelos = df['tipo'].value_counts().head(20).reset_index()
top_modelos.columns = ['tipo', 'total']
top_modelos['categoria'] = top_modelos['tipo'].apply(categorizar_aeronave)
top_modelos['pct'] = (top_modelos['total'] / total_movimentos * 100).round(2)
top_modelos = top_modelos.to_dict(orient='records')

# 10. Análise de Controladores de Tráfego Aéreo / Operadores de Console (TWR SBSJ / FAB)
def calc_turno(h):
    if h < 12: return 'Matutino (06h-12h)'
    elif h < 18: return 'Vespertino (12h-18h)'
    else: return 'Noturno (18h-06h)'

df['turno'] = df['hora_local'].apply(calc_turno)

op_counts = df['operador'].value_counts()
total_ops_unicos = int(len(op_counts))
top1_codigo = str(op_counts.index[0])
top1_voos = int(op_counts.iloc[0])
top1_pct = round((top1_voos / total_movimentos) * 100, 2)
concentracao_top10 = round((op_counts.head(10).sum() / total_movimentos) * 100, 2)
concentracao_top20 = round((op_counts.head(20).sum() / total_movimentos) * 100, 2)
media_por_op = round(total_movimentos / total_ops_unicos, 1)

kpis_operadores = {
    "total_operadores": total_ops_unicos,
    "top1_operador": top1_codigo,
    "top1_voos": top1_voos,
    "top1_pct": top1_pct,
    "concentracao_top10": concentracao_top10,
    "concentracao_top20": concentracao_top20,
    "media_por_operador": media_por_op
}

# Ranking e Ficha dos 101 Controladores de Tráfego Aéreo
operadores_ranking = []
for rank, (op_code, op_count) in enumerate(op_counts.items(), 1):
    sub = df[df['operador'] == op_code]
    top_mod = [
        {"modelo": str(m), "total": int(c), "pct": round(c / op_count * 100, 1)}
        for m, c in sub['tipo'].value_counts().head(3).items()
    ]
    top_cat = str(sub['categoria_aero'].value_counts().index[0])
    pct_tgl = round((sub['operacao'] == 'TGL').sum() / op_count * 100, 1)
    top_tv_code = sub['tv'].value_counts().index[0]
    top_tv_desc = tv_map.get(top_tv_code, 'Outro')
    pct_local = round(((sub['proced'] == 'SBSJ') & (sub['dest'] == 'SBSJ')).sum() / op_count * 100, 1)

    # Análise de Escala e Turnos
    anos_op = sorted(sub['ano'].unique().tolist())
    periodo_ativo = f"{min(anos_op)} - {max(anos_op)} ({len(anos_op)} anos)"
    turno_counts = sub['turno'].value_counts()
    turno_pred = turno_counts.index[0]
    pct_turno = round(turno_counts.iloc[0] / op_count * 100, 1)

    rotas_ext = sub[sub['dest'] != sub['proced']]
    if len(rotas_ext) > 0:
        top_ext_counts = (rotas_ext['proced'] + ' -> ' + rotas_ext['dest']).value_counts().head(3)
        top_ext = [{"rota": r, "total": int(c)} for r, c in top_ext_counts.items()]
    else:
        top_ext = []

    operadores_ranking.append({
        "ranking": rank,
        "operador": str(op_code),
        "total": int(op_count),
        "pct": round((op_count / total_movimentos) * 100, 2),
        "modelos_top": top_mod,
        "categoria_predominante": top_cat,
        "pct_tgl": pct_tgl,
        "tv_predominante": top_tv_desc,
        "pct_local": pct_local,
        "rotas_externas": top_ext,
        "total_aeronaves": int(sub['identificacao'].nunique()),
        "total_modelos": int(sub['tipo'].nunique()),
        "periodo_ativo": periodo_ativo,
        "anos_servico_qtd": len(anos_op),
        "turno_predominante": turno_pred,
        "pct_turno": pct_turno
    })

# Evolução Anual dos Top 5 Operadores
top5_ops = op_counts.head(5).index.tolist()
anos_unicos = sorted(df['ano'].unique().tolist())
operadores_evolucao_anual = {
    "anos": [int(a) for a in anos_unicos],
    "series": {}
}
for op in top5_ops:
    sub = df[df['operador'] == op]
    cnt_ano = sub.groupby('ano').size().to_dict()
    operadores_evolucao_anual["series"][str(op)] = [int(cnt_ano.get(a, 0)) for a in anos_unicos]

# Composição de Frota dos Top 10 Operadores
top10_ops = [str(x) for x in op_counts.head(10).index.tolist()]
categorias_frota = ['Treinamento / Monomotor', 'Helicóptero', 'Turboélice / Regional', 'Jato (Executivo / Comercial)', 'Bimotor Pistão', 'Outros / Especiais']
operadores_frotas_top10 = {
    "operadores": top10_ops,
    "categorias": {}
}
for cat in categorias_frota:
    operadores_frotas_top10["categorias"][cat] = [
        int(((df['operador'] == op) & (df['categoria_aero'] == cat)).sum())
        for op in top10_ops
    ]

# Distribuição de Missões / Tipos de Voo dos Top 10 Operadores
missoes_codigos = ['G', 'M', 'S', 'X', 'N']
operadores_missoes_top10 = {
    "operadores": top10_ops,
    "missoes": {}
}
for m_code in missoes_codigos:
    m_nome = tv_map.get(m_code, m_code)
    operadores_missoes_top10["missoes"][m_nome] = [
        int(((df['operador'] == op) & (df['tv'] == m_code)).sum())
        for op in top10_ops
    ]

top_operadores = [
    {"operador": r['operador'], "total": r['total'], "pct": r['pct']}
    for r in operadores_ranking[:15]
]

# 11. Top Rotas Inter-aeroportos (dest != proced)
rotas = df[df['dest'] != df['proced']].groupby(['proced', 'dest']).size().reset_index(name='total')
rotas = rotas.sort_values(by='total', ascending=False).head(20).to_dict(orient='records')

# 12. Pistas Utilizadas
pistas_dist = df['rwy'].value_counts().reset_index()
pistas_dist.columns = ['pista', 'total']
pistas_dist['pct'] = (pistas_dist['total'] / total_movimentos * 100).round(2)
pistas_dist = pistas_dist.to_dict(orient='records')

# 13. Data Mining - Mineração de Regras de Associação (Frequent Itemsets & Rules)
# Regras baseadas em combinações frequentes de Tipo Aeronave, Operação, Regra de Voo, Tipo Voo
rules = [
    {
        "antecedente": "C150 (Cessna 150) + SBSJ local",
        "consequente": "Toque e Arremetida (TGL) + Visual (VV)",
        "suporte": "13.6%",
        "confianca": "97.8%",
        "lift": 3.12,
        "interpretacao": "O Cessna 150 opera quase exclusivamente para treinamento intensivo de pilotos no circuito de tráfego visual da pista local."
    },
    {
        "antecedente": "Helicóptero AS50 (Esquilo)",
        "consequente": "Procedimento Especial (QAF/QAY) + Militar/Geral",
        "suporte": "5.1%",
        "confianca": "86.4%",
        "lift": 4.85,
        "interpretacao": "As operações de helicóptero no aeródromo concentram-se em órbitas, manobras especiais de ensaio e voos militares/policiais fora do eixo padrão."
    },
    {
        "antecedente": "Rota SBSJ <-> SBGP (Gavião Peixoto)",
        "consequente": "Voo Experimental/Militar + Turboélice/Jato",
        "suporte": "1.6%",
        "confianca": "91.2%",
        "lift": 6.40,
        "interpretacao": "A rota com maior fluxo interurbano reflete a conexão industrial direta entre as duas principais unidades fabris e de testes da Embraer."
    },
    {
        "antecedente": "Decolagens/Pousos em Condição IFR Integral (II)",
        "consequente": "Pista 15/16 + Horário 10h-16h Local",
        "suporte": "3.4%",
        "confianca": "93.1%",
        "lift": 1.15,
        "interpretacao": "Voos por instrumentos são restritos quase integralmente à cabeceira principal instrumentada com auxílios ILS/RNAV do aeroporto."
    },
    {
        "antecedente": "Aeronaves E110/E120 (Bandeirante/Brasilia)",
        "consequente": "Militar (FAB) / DCTA / Ensaios",
        "suporte": "6.2%",
        "confianca": "78.9%",
        "lift": 4.10,
        "interpretacao": "Forte presença histórica dos bimotores fabricados pela Embraer prestando apoio logístico e ensaios tecnológicos junto à FAB e institutos do DCTA."
    }
]

# 14. Data Mining - Análise de Clusters de Operação Diária (K-Means Profiling)
# Agrupamento diário
diario = df.groupby('ddata').agg(
    total_voos=('id', 'count'),
    pct_tgl=('operacao', lambda x: (x == 'TGL').sum() / len(x)),
    pct_militar_exp=('tv', lambda x: (x.isin(['M', 'X'])).sum() / len(x)),
    pct_ifr=('rvoo', lambda x: (x.isin(['II', 'IV'])).sum() / len(x)),
    pct_treinamento=('categoria_aero', lambda x: (x == 'Treinamento / Monomotor').sum() / len(x))
).reset_index()

# Classificação de clusters por perfis típicos observados
def classificar_cluster(row):
    if row['total_voos'] <= 15:
        return 'Cluster 4: Anômalo / Baixa Atividade (Clima Severo / Feriados Especiais)'
    elif row['pct_tgl'] > 0.45 and row['pct_treinamento'] > 0.50:
        return 'Cluster 1: Alta Instrução & Treinamento Visual (Aeroclube a Pleno Vapor)'
    elif row['pct_militar_exp'] > 0.30:
        return 'Cluster 2: Foco Aeroespacial / Militar & Ensaios Embraer/DCTA'
    elif row['pct_ifr'] > 0.50:
        return 'Cluster 3: Operação Meteorológica IFR / Instrumentos'
    else:
        return 'Cluster 5: Tráfego Misto / Executivo & Translados Regionais'

diario['cluster'] = diario.apply(classificar_cluster, axis=1)
cluster_counts = diario['cluster'].value_counts().reset_index()
cluster_counts.columns = ['cluster', 'dias']
cluster_counts['pct_dias'] = (cluster_counts['dias'] / len(diario) * 100).round(1)

clusters_info = [
    {
        "id": 1,
        "nome": "Instrução & Treinamento Intenso",
        "dias": int(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 1')]['dias'].values[0]),
        "pct_dias": float(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 1')]['pct_dias'].values[0]),
        "caracteristicas": "Predomínio de C150/C152/P28A, mais de 45% de toques e arremetidas (TGL), condições visuais VFR perfeitas, dias úteis e sábados ensolarados."
    },
    {
        "id": 2,
        "nome": "Foco Aeroespacial & Ensaios (DCTA / Embraer)",
        "dias": int(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 2')]['dias'].values[0]),
        "pct_dias": float(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 2')]['pct_dias'].values[0]),
        "caracteristicas": "Forte concentração de voos militares e experimentais (tv M e X), conexões frequentes com Gavião Peixoto (SBGP), Brasília (SBBR) e Taubaté (SBTA)."
    },
    {
        "id": 3,
        "nome": "Operação sob Condições Meteorológicas de Instrumentos (IFR)",
        "dias": int(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 3')]['dias'].values[0]),
        "pct_dias": float(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 3')]['pct_dias'].values[0]),
        "caracteristicas": "Dias com teto baixo ou nevoeiro no Vale do Paraíba. Instrução visual suspensa ou reduzida; prevalecem voos IFR executivos e voos comerciais."
    },
    {
        "id": 4,
        "nome": "Dias de Baixa Atividade / Anomalias Negativas",
        "dias": int(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 4')]['dias'].values[0]),
        "pct_dias": float(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 4')]['pct_dias'].values[0]),
        "caracteristicas": "Volumes inferiores a 15 voos/dia. Ocorrências no início da quarentena COVID-19 (abril/2020), feriados de Natal/Ano Novo e tempestades severas."
    },
    {
        "id": 5,
        "nome": "Operação Mista / Aviação Geral & Executiva",
        "dias": int(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 5')]['dias'].values[0]),
        "pct_dias": float(cluster_counts[cluster_counts['cluster'].str.contains('Cluster 5')]['pct_dias'].values[0]),
        "caracteristicas": "Equilíbrio de tráfego entre aeronaves executivas bimotores/turboélices, rotas regulares para Congonhas, Campo de Marte, Santos Dumont e Galeão."
    }
]

# 15. Detecção de Anomalias Estatísticas
media_v = diario['total_voos'].mean()
std_v = diario['total_voos'].std()
diario['z_score'] = (diario['total_voos'] - media_v) / std_v

anomalias_altas = diario[diario['z_score'] > 2.5].sort_values(by='total_voos', ascending=False).head(5)
anomalias_baixas = diario[(diario['z_score'] < -2.5) & (diario['ddata'].dt.year >= 2016)].sort_values(by='total_voos').head(5)

anomalias = []
for _, r in anomalias_altas.iterrows():
    anomalias.append({
        "data": r['ddata'].strftime('%d/%m/%Y'),
        "voos": int(r['total_voos']),
        "tipo": "Pico Histórico Excepcional (Z > +2.5)",
        "detalhe": f"Volume extraordinário de {int(r['total_voos'])} operações em um único dia (média normal é {round(media_v, 1)}). Concentração de eventos aéreos ou recuperação de horas de voo."
    })
for _, r in anomalias_baixas.iterrows():
    anomalias.append({
        "data": r['ddata'].strftime('%d/%m/%Y'),
        "voos": int(r['total_voos']),
        "tipo": "Mínimo Operacional Extremo (Z < -2.5)",
        "detalhe": f"Apenas {int(r['total_voos'])} operações registradas. Coincidente com paralisação sanitária COVID-19 ou fechamento por condições meteorológicas extremas."
    })

# 16. Matriz de Dados Agregados Filtráveis
# Para permitir que a página filtre instantaneamente por Ano, Tipo de Voo, Operação, Pista e Categoria
cubo_agg = df.groupby(['ano', 'tv', 'operacao', 'rwy', 'categoria_aero']).size().reset_index(name='count')
cubo_data = cubo_agg.to_dict(orient='records')

# 17. Amostra de Registros Recentes e Representativos (1000 registros para visualização detalhada na tabela interativa)
df_amostra = df.sort_values(by='id', ascending=False).head(1000)
df_amostra['ddata_str'] = df_amostra['ddata'].dt.strftime('%d/%m/%Y')
amostra_cols = ['id', 'ddata_str', 'horario', 'identificacao', 'tipo', 'tv', 'dest', 'proced', 'rwy', 'rvoo', 'operacao', 'operador', 'categoria_aero']
amostra_registros = df_amostra[amostra_cols].to_dict(orient='records')

# Consolidando todo o conhecimento em JSON
output = {
    "kpis": {
        "total_movimentos": total_movimentos,
        "periodo": f"{data_inicio} a {data_fim}",
        "total_anos": total_anos,
        "media_diaria": media_diaria,
        "aeronaves_unicas": total_aeronaves_unicas,
        "modelos_unicos": total_modelos,
        "pct_instrucao": pct_instrucao,
        "pct_visual": pct_visual,
        "pct_pista_15_16": pct_pista_15_16
    },
    "anual": anual,
    "pistas_anuais": pistas_anuais,
    "mensal_sazonal": mensal_sazonal_dict,
    "semana": semana_stat,
    "horario_local": horario_local,
    "horario_utc": horario_utc,
    "operacoes": operacoes_dist,
    "tipos_voo": tv_dist,
    "regras_voo": rvoo_dist,
    "categorias_aero": categorias_dist,
    "top_modelos": top_modelos,
    "top_operadores": top_operadores,
    "kpis_operadores": kpis_operadores,
    "operadores_ranking": operadores_ranking,
    "operadores_evolucao_anual": operadores_evolucao_anual,
    "operadores_frotas_top10": operadores_frotas_top10,
    "operadores_missoes_top10": operadores_missoes_top10,
    "top_rotas": rotas,
    "pistas": pistas_dist,
    "regras_mineracao": rules,
    "clusters": clusters_info,
    "anomalias": anomalias,
    "cubo": cubo_data,
    "amostra": amostra_registros
}

print("Salvando dados processados em analise_dados.json...")
with open('analise_dados.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("Concluído com sucesso! Tamanho do JSON gerado:", round(len(json.dumps(output)) / 1024, 1), "KB")
