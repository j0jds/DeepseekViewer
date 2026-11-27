"""
Detecção de temas — 100% local, só biblioteca padrão.

Três camadas:
  1. CATEGORIAS: dicionário embutido (português + inglês). Um chat entra em até 3 categorias.
  2. PALAVRAS-CHAVE: termos mais característicos de cada chat (TF-IDF); termos que se repetem
     em 2+ chats viram "temas" agrupáveis.
  3. PERSONALIZADOS: temas que o usuário cria (nome + palavras + chats escolhidos à mão),
     salvos em topicos.json.
"""
import json
import math
import os
import re
import unicodedata
import uuid
from collections import Counter

# palavras terminadas em * casam por prefixo (ex.: "program*" → programa, programação, programar)
CATEGORIES = {
    "Programação e código": (
        "python javascript typescript java kotlin rust golang php ruby swift html css sql react vue angular node npm pip "
        "program* codigo code script funcao function classe class variavel bug erro error debug compil* api json yaml "
        "git github docker linux bash terminal framework biblioteca library backend frontend servidor server banco "
        "database algoritmo repositorio deploy regex stack exception import"
    ),
    "Inteligência artificial": (
        "deepseek chatgpt gpt claude gemini llama openai anthropic modelo model modelos llm ia inteligencia artificial "
        "prompt token tokens treinamento neural rede machine learning chatbot agente agent embedding fine-tuning "
        "alucinacao raciocinio reasoning"
    ),
    "Segurança e privacidade": (
        "seguranca privacidade privacy security senha password hacker hack vazamento criptografia encryption malware "
        "virus phishing golpe fraude autenticacao 2fa vpn lgpd gdpr dados pessoais protecao risco ameaca vulnerabilidade "
        "firewall backup confidencial"
    ),
    "Tecnologia e dispositivos": (
        "celular smartphone iphone android notebook computador pc windows macos mac chip processador memoria ram placa "
        "video monitor teclado mouse wifi internet roteador bluetooth app aplicativo software hardware bateria tela "
        "samsung apple google microsoft"
    ),
    "Estudos e educação": (
        "estudar estudo prova provas enuncia* escola faculdade universidade vestibular enem concurso aula curso materia "
        "disciplina professor aluno redacao resumo exercicio exercicios tcc tese mestrado doutorado artigo academico "
        "bibliografia monografia"
    ),
    "Matemática e ciências": (
        "matematica calculo equacao derivada integral algebra geometria estatistica probabilidade fisica quimica biologia "
        "formula teorema grafico matriz vetor energia atomo celula molecula experimento hipotese"
    ),
    "Idiomas e tradução": (
        "traduzir traducao translate translation ingles english espanhol frances alemao japones chines italiano idioma "
        "gramatica vocabulario pronuncia verbo sinonimo significado expressao portugues"
    ),
    "Escrita e criação": (
        "escrever texto redigir email carta poema poesia historia conto roteiro livro capitulo personagem narrativa "
        "blog post legenda slogan discurso reescrever revisar copy artigo criativo ficcao"
    ),
    "Trabalho e carreira": (
        "trabalho emprego carreira curriculo cv entrevista vaga empresa chefe cliente reuniao projeto equipe gestao "
        "marketing vendas startup negocio empreendedor freelancer salario linkedin produtividade"
    ),
    "Finanças e economia": (
        "dinheiro investimento investir acao acoes bolsa cripto bitcoin banco cartao credito emprestimo divida juros "
        "inflacao imposto impostos renda orcamento financeiro economia mercado dolar real preco custo gasto poupanca "
        "aposentadoria pix cota* plano assinatura cobranca"
    ),
    "Saúde e bem-estar": (
        "saude medico remedio medicamento sintoma doenca dor tratamento dieta nutricao treino exercicio academia sono "
        "ansiedade terapia psicologo exame vacina alimentacao emagrecer vitamina hospital consulta"
    ),
    "Direito e política": (
        "lei leis juridico advogado direito contrato processo justica tribunal governo politica eleicao presidente "
        "congresso constituicao regulamento norma multa tributo previdencia inss"
    ),
    "Notícias e atualidades": (
        "noticia noticias atualizacao atualizacoes lancamento lancou novidade recente recentes anuncio mudanca mudancas "
        "mundo guerra pais crise relatorio news update release announced"
    ),
    "Cozinha e receitas": (
        "receita receitas cozinha cozinhar comida prato ingrediente ingredientes bolo massa carne frango arroz feijao "
        "tempero forno assar fritar sobremesa lanche jantar almoco cafe"
    ),
    "Viagens e lugares": (
        "viagem viajar passagem voo hotel hospedagem turismo roteiro passeio pais cidade destino mapa aeroporto "
        "passaporte visto mochila praia"
    ),
    "Entretenimento e cultura": (
        "filme filmes serie series jogo jogos game games musica banda cantor show livro livros anime manga youtube "
        "netflix spotify futebol esporte time campeonato arte pintura teatro"
    ),
    "Casa e cotidiano": (
        "casa apartamento aluguel reforma moveis limpeza decoracao jardim planta pet cachorro gato carro moto "
        "mecanico compra comprar loja produto entrega familia filho filhos crianca"
    ),
}

STOP = set("""
a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre entre ate ao aos
e ou mas se que como quando onde porque pois porem entao assim tambem ainda ja so apenas mais menos muito muita
muitos muitas pouco pouca bem mal melhor pior tudo todo toda todos todas cada outro outra outros outras mesmo mesma
eu tu ele ela nos vos eles elas me te lhe lhes meu minha meus minhas teu tua seu sua seus suas nosso nossa
isso isto aquilo esse essa esses essas este esta estes estas aquele aquela aqueles aquelas aqui ali la ca
ser sou es eh somos sao era eram foi foram sera serao seria ter tenho tem temos tinha tiveram tera teria
estar estou esta estamos estao estava estive estiver haver ha havia houve fazer faz fazem fiz fez fazendo
ir vou vai vamos vao ia foi poder pode podem posso podemos podia queria quero quer querem deve devo devem
dar da dou dao ver vejo ve veja dizer diz disse falar fala fale usar uso usa usando usado usada uso
nao sim talvez agora hoje ontem sempre nunca depois antes logo ainda alem durante atraves segundo conforme
the and for are but not you all can had her was one our out day get has him his how its may new now old see two way
who boy did she use that this with from have they will what when your said each which their time there about would
these other into more some could them than then been were also just like only over such very where while should
pode podem podera deve devem sobre voce voces vc pq tb tbm entao vamos favor pode ajuda ajudar preciso
resposta responder pergunta perguntas exemplo exemplos forma maneira coisa coisas parte partes vez vezes caso casos
isso aqui sendo feito feita fazer tipo tipos junto bastante varios varias algum alguma alguns algumas nenhum nenhuma
quer quais qual quanto quantos quantas toda todo mesmo sendo ser fica ficar fiquei deixar deixa
faco fazemos fazia fazer faca facam fiz fizer fosse seja sejam estao estive tenha tenham possa possam
precisa precisam gostaria queria obrigado obrigada ola oi
""".split())
MIN_LEN = 4

_url = re.compile(r"https?://\S+")
_fence = re.compile(r"```.*?```", re.S)
_tok = re.compile(r"[a-z0-9]+")


def fold(s):
    out = []
    for c in s:
        n = unicodedata.normalize("NFD", c)[:1].lower()
        out.append(n if len(n) == 1 else c)
    return "".join(out)


def _tokens(text):
    return _tok.findall(fold(text))


def _compile_categories():
    comp = {}
    for name, words in CATEGORIES.items():
        exact, prefix = set(), []
        for w in words.split():
            if w.endswith("*"):
                prefix.append(w[:-1])
            else:
                exact.add(w)
        comp[name] = (exact, tuple(prefix))
    return comp


_CATS = _compile_categories()


def _chat_parts(chat):
    """(título, texto do usuário, texto do assistente sem código, nº de blocos de código)"""
    user, asst, fences = [], [], 0
    for m in chat.get("messages", []):
        for f in m.get("fragments", []) or []:
            t = f.get("type")
            c = f.get("content") or ""
            if t == "REQUEST":
                fences += len(_fence.findall(c))
                user.append(_fence.sub(" ", c))
            elif t == "RESPONSE":
                fences += len(_fence.findall(c))
                asst.append(_fence.sub(" ", c))
    return (chat.get("title") or ""), _url.sub(" ", "\n".join(user)), _url.sub(" ", "\n".join(asst)), fences


def analyze(chats):
    """chats: {id: chat}. Retorna dict com categorias e palavras-chave por chat."""
    n = len(chats)
    weighted = {}   # id -> Counter(token -> peso)
    fences = {}
    for cid, chat in chats.items():
        title, user, asst, nf = _chat_parts(chat)
        c = Counter()
        for tok in _tokens(title):
            c[tok] += 3
        for tok in _tokens(user):
            c[tok] += 2
        for tok in _tokens(asst):
            c[tok] += 1
        weighted[cid] = c
        fences[cid] = nf

    # --- categorias ---------------------------------------------------
    chat_cats = {}
    for cid, c in weighted.items():
        scores = {}
        for name, (exact, prefix) in _CATS.items():
            score, distinct = 0, set()
            for tok, w in c.items():
                if tok in exact or (prefix and tok.startswith(prefix)):
                    score += w
                    distinct.add(tok)
            if name == "Programação e código":
                score += min(fences[cid], 10) * 3
                if fences[cid]:
                    distinct.add("<codigo>")
            if len(distinct) >= 2 and score >= 4:
                scores[name] = score
        if scores:
            top = max(scores.values())
            keep = sorted((k for k, v in scores.items() if v >= 0.35 * top), key=lambda k: -scores[k])[:3]
            chat_cats[cid] = keep
        else:
            chat_cats[cid] = []

    # --- palavras-chave (TF-IDF) --------------------------------------
    df = Counter()
    for c in weighted.values():
        for tok in c:
            df[tok] += 1

    def ok(tok):
        return len(tok) >= MIN_LEN and tok not in STOP and not tok.isdigit() and not re.fullmatch(r"[0-9a-f]{6,}", tok)

    chat_kw = {}
    for cid, c in weighted.items():
        scored = []
        for tok, w in c.items():
            if not ok(tok):
                continue
            idf = math.log((n + 1) / (df[tok] + 1)) + 1
            scored.append((tok, (1 + math.log(w)) * idf))
        scored.sort(key=lambda x: (-x[1], x[0]))
        chat_kw[cid] = [t for t, _ in scored[:20]]
    return {"chat_cats": chat_cats, "chat_kw": chat_kw}


def build_groups(analysis, chat_ids):
    """Grupos automáticos: categorias e palavras-chave compartilhadas."""
    groups = []
    by_cat = {}
    for cid, cats in analysis["chat_cats"].items():
        for cat in cats:
            by_cat.setdefault(cat, []).append(cid)
    for cat, ids in by_cat.items():
        groups.append({"key": "cat:" + cat, "kind": "category", "name": cat, "chat_ids": ids})

    n = len(chat_ids)
    by_kw = {}
    for cid, kws in analysis["chat_kw"].items():
        for kw in kws[:12]:
            by_kw.setdefault(kw, []).append(cid)
    kw_groups = []
    for kw, ids in by_kw.items():
        if len(ids) >= 2 and (n < 6 or len(ids) <= 0.5 * n):
            kw_groups.append({"key": "kw:" + kw, "kind": "keyword", "name": kw, "chat_ids": ids})
    kw_groups.sort(key=lambda g: (-len(g["chat_ids"]), g["name"]))
    groups.extend(kw_groups[:40])
    return groups


# ----------------------------------------------------------------------------
# Temas personalizados (topicos.json)
# ----------------------------------------------------------------------------
def load_custom(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return _clean_custom(data.get("topics", []))
    except (OSError, ValueError, AttributeError):
        return []


def _clean_custom(topics):
    out = []
    for t in topics if isinstance(topics, list) else []:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "").strip()[:60]
        if not name:
            continue
        kws = [str(k).strip()[:40] for k in (t.get("keywords") or []) if str(k).strip()][:50]
        chats = [str(c)[:100] for c in (t.get("chats") or [])][:5000]
        tid = re.sub(r"[^A-Za-z0-9_-]", "", str(t.get("id") or ""))[:40] or uuid.uuid4().hex[:10]
        out.append({"id": tid, "name": name, "keywords": kws, "chats": chats})
    return out[:200]


def save_custom(path, topics):
    topics = _clean_custom(topics)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"topics": topics}, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return topics


def custom_groups(topics, search_text):
    """search_text: id -> (title, text, ftext, ftitle). Casa por palavra (contém) + chats manuais."""
    groups = []
    for t in topics:
        kws = [k for k in (fold(k).strip() for k in t["keywords"]) if k]
        ids = []
        for cid, (_title, _text, ftext, ftitle) in search_text.items():
            if cid in t["chats"] or (kws and any(k in ftitle or k in ftext for k in kws)):
                ids.append(cid)
        groups.append({"key": "cu:" + t["id"], "kind": "custom", "name": t["name"], "chat_ids": ids,
                       "custom": {"id": t["id"], "keywords": t["keywords"], "chats": t["chats"]}})
    return groups
