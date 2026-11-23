// Listas iniciais do casamento.
// Convidado: { id, nome, lado: "noiva"|"noivo"|"ambos", grupo, acompanhantes, status: "pendente"|"confirmado"|"recusou", obs }
// Fornecedor: { id, nome, total (null = a definir), obs, parcelas: [{ id, descricao, valor, quando, pago }] }
// Itens novos adicionados aqui aparecem no sistema mesmo depois que ele já estiver em uso.
window.SEED = {
  convidados: [
    // Família do noivo (7)
    { id: "noivo-mae",      nome: "Mãe do noivo",      lado: "noivo", grupo: "Família" },
    { id: "noivo-padrasto", nome: "Padrasto do noivo", lado: "noivo", grupo: "Família" },
    { id: "noivo-tia",      nome: "Tia do noivo",      lado: "noivo", grupo: "Família" },
    { id: "noivo-maicon",   nome: "Maicon",            lado: "noivo", grupo: "Família" },
    { id: "noivo-laissia",  nome: "Laissia",           lado: "noivo", grupo: "Família" },
    { id: "noivo-rebeca",   nome: "Rebeca",            lado: "noivo", grupo: "Família" },
    { id: "noivo-fabio",    nome: "Fábio",             lado: "noivo", grupo: "Família" },

    // Família da noiva (2)
    { id: "noiva-mae",     nome: "Mãe da noiva", lado: "noiva", grupo: "Família" },
    { id: "noiva-leandro", nome: "Leandro",      lado: "noiva", grupo: "Família" },

    // Amigos
    { id: "a-alansia",   nome: "Alansia e Arthur",          lado: "ambos", grupo: "Amigos",    acompanhantes: 1 },
    { id: "a-denise",    nome: "Denise e cia",              lado: "ambos", grupo: "Padrinhos", acompanhantes: 4, obs: "Madrinha com Henrique" },
    { id: "a-thiffany",  nome: "Thiffany e cia",            lado: "ambos", grupo: "Padrinhos", acompanhantes: 3, obs: "Madrinha com Guilherme" },
    { id: "a-roberto",   nome: "Roberto e Tamires",         lado: "ambos", grupo: "Amigos",    acompanhantes: 1 },
    { id: "a-anapaula",  nome: "Ana Paula e cia",           lado: "ambos", grupo: "Amigos",    acompanhantes: 6 },
    { id: "a-pedro",     nome: "Pedro e cia",               lado: "ambos", grupo: "Amigos",    acompanhantes: 1 },
    { id: "a-manel",     nome: "Manel e Sara",              lado: "ambos", grupo: "Amigos",    acompanhantes: 1 },
    { id: "a-yago",      nome: "Yaguin e Samela",           lado: "ambos", grupo: "Padrinhos", acompanhantes: 1, obs: "Padrinhos (Yago e Samela)" },
    { id: "a-jhon",      nome: "Jhon e Duda",               lado: "ambos", grupo: "Padrinhos", acompanhantes: 1, obs: "Padrinhos" },
    { id: "a-jao",       nome: "Jão",                       lado: "ambos", grupo: "Amigos" },
    { id: "a-marialuisa",nome: "Maria Luísa",               lado: "ambos", grupo: "Amigos" },
    { id: "a-jp",        nome: "JP e namorada",             lado: "ambos", grupo: "Amigos",    acompanhantes: 1 },
    { id: "a-thaynara",  nome: "Thaynara, filhas e marido", lado: "ambos", grupo: "Amigos",    acompanhantes: 2 }
  ],

  after: [],

  fornecedores: [
    { id: "f-fogos", nome: "Fogos", total: 1870, parcelas: [
      { id: "f-fogos-1", descricao: "Entrada (50%)", valor: 935, quando: "Entrada" },
      { id: "f-fogos-2", descricao: "Restante (50%)", valor: 935, quando: "Até 3 dias antes do evento" }
    ]},
    { id: "f-espaco", nome: "Espaço da cerimônia", total: 6000, parcelas: [
      { id: "f-espaco-1", descricao: "Entrada (30%)", valor: 1800, quando: "Entrada" },
      { id: "f-espaco-2", descricao: "Restante (70%)", valor: 4200, quando: "A combinar" }
    ]},
    { id: "f-cerimonial", nome: "Cerimonialista", total: null, obs: "Valor total não informado", parcelas: [
      { id: "f-cerimonial-1", descricao: "Entrada", valor: 175, quando: "Entrada" }
    ]},
    { id: "f-banda", nome: "Banda", total: 2250, parcelas: [
      { id: "f-banda-1", descricao: "Entrada (30%)", valor: 675, quando: "Entrada" },
      { id: "f-banda-2", descricao: "Restante (70%)", valor: 1575, quando: "1 semana antes do casamento" }
    ]},
    { id: "f-decoradora", nome: "Decoradora", total: null, obs: "Valor ainda não definido", parcelas: [] },
    { id: "f-mesas", nome: "Mesas e cadeiras", total: 982, parcelas: [
      { id: "f-mesas-1", descricao: "Entrada (30%)", valor: 294.6, quando: "Entrada" },
      { id: "f-mesas-2", descricao: "Restante (70%)", valor: 687.4, quando: "A combinar" }
    ]}
  ]
};
