import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Library, Users, Trophy, Sparkles, Check, Menu, X, Mail, ChevronDown, ClipboardList, MessageSquare, BarChart3, Maximize2, GraduationCap, Sun, Moon, Pause, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import LandingAtmosphere, { useSystemColorScheme } from '@/components/LandingAtmosphere';
import { trackClick, trackSection, trackForm } from '@/hooks/useAnalytics';
import './LandingPage.css';

const photo = (name) => `/landing-photos/${name}.webp`;
const nav = [['A plataforma', 'plataforma'], ['Na prática', 'na-pratica'], ['Como funciona', 'como-funciona']];
const productTours = {
  alunos: {
    label: 'Alunos', icon: BookOpen, description: 'Descubra sua próxima leitura e acompanhe suas conquistas.', interests: ['Descoberta de livros', 'XP e conquistas', 'Atividades'],
    screens: [
      { id: 'aluno-biblioteca', title: 'Descubra um livro para você', label: 'Biblioteca do aluno', text: 'Explore o catálogo e encontre títulos de acordo com seus interesses.', actions: ['Abra Biblioteca no menu e pesquise um título, autor ou área.', 'Confira a disponibilidade e use Solicitar para pedir um exemplar disponível.'], alt: 'Biblioteca do aluno na BibliotecAI com busca, filtros e livros disponíveis para solicitação, com dados de demonstração.' },
      { id: 'aluno-perfil', title: 'Acompanhe sua jornada de leitura', label: 'Perfil e conquistas do aluno', text: 'Veja seu nível, o progresso de leitura e os selos que pode conquistar.', actions: ['Entre em Meu Perfil para consultar seu nível e XP acumulado.', 'Veja os selos e conquistas para conhecer os próximos objetivos de leitura.'], alt: 'Meu Perfil do aluno na BibliotecAI mostrando jornada de leitura, nível, XP, selos e conquistas, com dados de demonstração.' },
      { id: 'aluno-atividades', title: 'Participe das atividades', label: 'Atividades do aluno', text: 'Consulte as propostas dos professores e organize suas entregas.', actions: ['Acesse Atividades e confira o enunciado e o prazo da proposta.', 'Abra a atividade, prepare sua resposta e envie para avaliação do professor.'], alt: 'Área de atividades do aluno na BibliotecAI com proposta de leitura e prazo de entrega, com dados de demonstração.' },
    ],
  },
  professores: {
    label: 'Professores', icon: GraduationCap, description: 'Conecte a leitura ao planejamento e ao acompanhamento das turmas.', interests: ['Minhas turmas', 'Atividades de leitura', 'Acompanhamento'],
    screens: [
      { id: 'professor-alunos', title: 'Conheça os alunos das suas turmas', label: 'Meus alunos', text: 'Encontre os estudantes vinculados às turmas liberadas para seu perfil.', actions: ['Abra Meus Alunos e escolha a turma que deseja consultar.', 'Use a busca por nome ou matrícula para localizar um estudante.'], alt: 'Tela Meus Alunos do professor na BibliotecAI com filtro por turma e lista de estudantes fictícios.' },
      { id: 'professor-atividades', title: 'Crie uma atividade de leitura', label: 'Painel de atividades do professor', text: 'Transforme uma leitura em uma proposta para um aluno ou uma turma.', actions: ['Entre em Sugestões e Atividades e selecione Nova atividade.', 'Defina o título, as instruções, o público e o prazo; salve e acompanhe as entregas.'], alt: 'Painel do Professor na BibliotecAI com atividades enviadas, turmas liberadas e botão Nova atividade, com dados de demonstração.' },
      { id: 'professor-relatorios', title: 'Acompanhe a leitura da turma', label: 'Relatórios de leitura do professor', text: 'Consulte os dados de leitura para apoiar suas próximas ações pedagógicas.', actions: ['Abra Relatórios de Leitura e selecione a turma e o período.', 'Consulte os indicadores e os registros para acompanhar a participação dos alunos.'], alt: 'Relatórios de leitura do professor na BibliotecAI com filtros por turma e período e indicadores de demonstração.' },
    ],
  },
  gestores: {
    label: 'Gestores', icon: BarChart3, description: 'Tenha uma visão da escola e organize o acesso da comunidade.', interests: ['Visão geral', 'Pessoas e acessos', 'Relatórios'],
    screens: [
      { id: 'gestor-painel', title: 'Veja a biblioteca em uma visão geral', label: 'Dashboard do gestor', text: 'Acompanhe o acervo, os usuários, as leituras ativas e os alertas de atraso.', actions: ['Acesse Dashboard com o perfil de gestor da sua instituição.', 'Consulte os indicadores e gráficos para identificar o uso da biblioteca.'], alt: 'Dashboard da BibliotecAI no perfil de gestor com indicadores de livros, usuários e leituras e gráficos de demonstração.' },
      { id: 'gestor-usuarios', title: 'Organize as pessoas da escola', label: 'Usuários da instituição', text: 'Consulte os cadastros e organize os vínculos da comunidade escolar.', actions: ['Abra Usuários e localize a pessoa pelos campos de busca e filtros.', 'Revise os dados e os vínculos de turma para manter os cadastros organizados.'], alt: 'Área de usuários da BibliotecAI no perfil de gestor com cadastros e estudantes fictícios.' },
      { id: 'gestor-relatorios', title: 'Use os dados para planejar', label: 'Relatórios de gestão', text: 'Entenda a movimentação da biblioteca e os livros mais procurados.', actions: ['Entre em Relatórios para consultar os indicadores da biblioteca.', 'Compare os empréstimos por mês e os títulos mais emprestados para apoiar o planejamento.'], alt: 'Relatórios de gestão da BibliotecAI com indicadores e gráficos sobre acervo e empréstimos, com dados de demonstração.' },
    ],
  },
};

function HowItWorks({ theme }) {
  const [profile, setProfile] = useState('alunos');
  const [activeScreen, setActiveScreen] = useState(0);
  const tour = productTours[profile];
  const currentScreen = tour.screens[activeScreen];
  function selectStep(index) {
    setActiveScreen(index);
    trackClick(`como_funciona_${profile}_${tour.screens[index].id}`);
  }

  return <section id="como-funciona" className="lp-how"><LandingAtmosphere variant="section" /><div className="lp-container">
    <div className="lp-section-heading"><div><span className="lp-eyebrow">COMO FUNCIONA</span><h2>Encontre seu perfil.<br />Veja como começar.</h2></div><a className="lp-button lp-button-light" href="#contato">Quero uma demonstração <ArrowUpRight size={18} /></a></div>
    <div className="lp-profile-picker" role="group" aria-label="Escolha seu perfil de interesse">{Object.entries(productTours).map(([key, item]) => { const Icon = item.icon; return <button key={key} type="button" aria-pressed={profile === key} onClick={() => { setProfile(key); setActiveScreen(0); trackClick(`como_funciona_perfil_${key}`); }}><Icon size={23} strokeWidth={1.5} /><span><strong>{item.label}</strong><span>{item.description}</span></span><ArrowUpRight size={18} /></button>; })}</div>
    <div className="lp-tour-intro"><div><span className="lp-eyebrow">PASSO A PASSO PARA {tour.label.toUpperCase()}</span><p>{tour.description}</p></div><ul aria-label={`Áreas de interesse de ${tour.label.toLowerCase()}`}>{tour.interests.map((interest) => <li key={interest}>{interest}</li>)}</ul></div>
    <div className="lp-product-tour">
      <figure className="lp-product-screen" aria-label={currentScreen.label}>
        <div className="lp-screen-toolbar"><span className="lp-window-dots" aria-hidden="true"><i /><i /><i /></span><span>BibliotecAI / {currentScreen.label}</span><span className="lp-screen-tag">DEMONSTRAÇÃO</span></div>
        <Dialog>
          <DialogTrigger asChild><button type="button" className="lp-screen-zoom" aria-label={`Ampliar tela: ${currentScreen.label}`}><img key={currentScreen.id} src={`/product-screens/${currentScreen.id}.png`} alt={currentScreen.alt} width={1440} height={1000} loading="lazy" /><span><Maximize2 size={15} /> Ampliar tela</span></button></DialogTrigger>
          <DialogContent className="lp-screen-dialog" data-lp-theme={theme}><DialogTitle>{currentScreen.label}</DialogTitle><DialogDescription>Print em tamanho original, com dados de demonstração. Role ou deslize a imagem para explorar os detalhes.</DialogDescription><div className="lp-screen-dialog-image" role="region" aria-label="Print ampliado com rolagem" tabIndex={0}><img src={`/product-screens/${currentScreen.id}.png`} alt={currentScreen.alt} width={1440} height={1000} /></div><a className="lp-screen-download" href={`/product-screens/${currentScreen.id}.png`} download={`bibliotecai-${currentScreen.id}.png`}>Baixar este print <ArrowUpRight size={15} /></a></DialogContent>
        </Dialog>
        <figcaption>Interface de {tour.label.toLowerCase()} com dados de demonstração. Clique na imagem para ampliar.</figcaption>
      </figure>
      <div className="lp-tour-steps" role="group" aria-label={`Etapas para ${tour.label.toLowerCase()}`}>{tour.screens.map((screen, index) => <button key={screen.id} type="button" className={index === activeScreen ? 'lp-tour-step is-active' : 'lp-tour-step'} aria-pressed={index === activeScreen} aria-controls="lp-current-instructions" onClick={() => selectStep(index)}><span className="lp-tour-number">0{index + 1}</span><span><strong>{screen.title}</strong><span className="lp-tour-description">{screen.text}</span><span className="lp-tour-view">Ver este passo <ArrowRight size={14} /></span></span></button>)}</div>
    </div>
    <div className="lp-tour-instructions" id="lp-current-instructions"><div><p className="lp-tour-progress" role="status">{tour.label} · Passo {activeScreen + 1} de {tour.screens.length}</p><h3>{currentScreen.title}</h3><ol>{currentScreen.actions.map((action) => <li key={action}>{action}</li>)}</ol></div><div className="lp-tour-pagination"><button type="button" onClick={() => selectStep(activeScreen - 1)} disabled={activeScreen === 0}><ArrowLeft size={16} /> Anterior</button><button type="button" onClick={() => selectStep(activeScreen + 1)} disabled={activeScreen === tour.screens.length - 1}>Próximo passo <ArrowRight size={16} /></button></div></div>
  </div></section>;
}
const experiences = {
  gestao: { label: 'Para a biblioteca', title: 'Mais organização. Mais tempo para os leitores.', text: 'Reúna o acervo, acompanhe empréstimos e devoluções e tenha uma visão da rotina da biblioteca em um só lugar.', image: 'gestao-biblioteca', alt: 'Bibliotecária utilizando o acervo da BibliotecAI no computador da escola', items: ['Cadastro e consulta do acervo', 'Controle de empréstimos e devoluções', 'Relatórios para acompanhar a biblioteca'] },
  alunos: { label: 'Para os alunos', title: 'A próxima leitura começa com uma descoberta.', text: 'Uma experiência que aproxima os alunos dos livros, com acesso ao catálogo, perfil de leitura e conquistas ao longo do caminho.', image: 'aluno-plataforma', alt: 'Aluno acessando seu perfil na BibliotecAI em um computador da escola', items: ['Catálogo para descobrir novos livros', 'Níveis, XP e conquistas de leitura', 'Atividades e comunicação com a escola'] },
  professores: { label: 'Para os professores', title: 'A leitura também faz parte da sala de aula.', text: 'Conecte atividades, materiais didáticos e acompanhamento da leitura à experiência da biblioteca escolar.', image: 'bibliotecaria', alt: 'Profissional da biblioteca consultando os registros ao lado da plataforma BibliotecAI', items: ['Atividades para as turmas', 'Compartilhamento de materiais didáticos', 'Acompanhamento da leitura dos alunos'] },
};
const features = [
  [Library, 'Acervo organizado', 'Livros, exemplares e disponibilidade em um catálogo que acompanha a rotina da escola.'],
  [ClipboardList, 'Empréstimos sob controle', 'Registre retiradas e devoluções e consulte o histórico sem se perder nos registros.'],
  [Trophy, 'Leitura que engaja', 'XP, níveis e ranking tornam cada etapa da jornada de leitura mais envolvente.'],
  [Sparkles, 'Inteligência artificial', 'Quizzes e desafios de leitura com IA para ampliar as possibilidades de aprendizagem.'],
  [MessageSquare, 'Comunidade conectada', 'Comunicados, atividades e materiais aproximam biblioteca, professores e alunos.'],
  [BarChart3, 'Informação para decidir', 'Acompanhe empréstimos e leitura com relatórios que ajudam a entender o uso do acervo.'],
];
const faqs = [
  ['Para quem a BibliotecAI foi criada?', 'Para bibliotecas escolares que querem organizar seu acervo e conectar a gestão dos livros à experiência de alunos e professores. A plataforma reúne áreas específicas para cada perfil.'],
  ['Preciso trocar os livros físicos por digitais?', 'Os livros físicos continuam no centro da biblioteca. A BibliotecAI ajuda a organizar o acervo, registrar empréstimos e aproximar os leitores dos livros que a escola já possui.'],
  ['Como posso conhecer a plataforma?', 'Se sua escola já utiliza a BibliotecAI, entre com o acesso fornecido pela instituição. Para apresentar a solução a uma nova escola, solicite uma demonstração pelo formulário abaixo.'],
  ['É possível importar o acervo existente?', 'A plataforma possui importação de livros por planilha. Na apresentação, podemos avaliar como preparar os dados do acervo da sua escola para a implantação.'],
];

function Brand() {
  return <a className="lp-brand" href="#inicio" aria-label="BibliotecAI — início"><span className="lp-brand-icon"><img src={photo('logo')} alt="" /></span><span>Bibliotec<span>AI</span></span></a>;
}

export default function LandingPage() {
  const theme = useSystemColorScheme();
  const [motionPaused, setMotionPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audience, setAudience] = useState('gestao');
  const [emailReady, setEmailReady] = useState(false);
  const current = experiences[audience];

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { trackSection(entry.target.id); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.25 });
    document.querySelectorAll('.bibliotecai-landing main section[id]').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  function prepareEmail(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = `Olá! Quero conhecer a BibliotecAI.\n\nNome: ${data.get('nome')}\nE-mail: ${data.get('email')}\nEscola: ${data.get('escola')}\n\n${data.get('mensagem') || ''}`;
    trackForm('submit', { assunto: 'demonstracao' });
    window.location.href = `mailto:contato@bibliotecai.com.br?subject=${encodeURIComponent('Demonstração da BibliotecAI')}&body=${encodeURIComponent(body)}`;
    setEmailReady(true);
  }

  return <div className="bibliotecai-landing" id="inicio" data-lp-theme={theme} data-motion-paused={motionPaused}>
    <a className="lp-skip" href="#conteudo">Ir para o conteúdo</a>
    <LandingAtmosphere />
    <header className="lp-header"><div className="lp-container lp-nav">
      <Brand />
      <nav className={menuOpen ? 'lp-links is-open' : 'lp-links'} aria-label="Navegação principal">
        {nav.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
        <a className="lp-mobile-login" href="/auth">Entrar na plataforma <ArrowUpRight size={16} /></a>
      </nav>
      <a className="lp-login" href="/auth" onClick={() => trackClick('nav_entrar')}>Entrar na plataforma <ArrowUpRight size={16} /></a>
      <div className="lp-appearance-controls"><span className="lp-system-theme" role="img" aria-label={`Tema ${theme === 'dark' ? 'escuro' : 'claro'} automático, seguindo o sistema`} title={`Tema ${theme === 'dark' ? 'escuro' : 'claro'} · automático pelo sistema`}>{theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}</span><button type="button" className="lp-motion-toggle" aria-label={motionPaused ? 'Retomar animações de fundo' : 'Pausar animações de fundo'} aria-pressed={motionPaused} title={motionPaused ? 'Retomar animações' : 'Pausar animações'} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused ? <Play size={15} /> : <Pause size={15} />}</button></div>
      <button className="lp-menu" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
    </div></header>

    <main id="conteudo">
      <section className="lp-hero lp-container">
        <div className="lp-hero-copy"><span className="lp-eyebrow"><span className="lp-dot" /> TECNOLOGIA QUE APROXIMA DA LEITURA</span>
          <h1>Uma biblioteca<br />mais conectada.<br /><em>Uma escola que lê.</em></h1>
          <p>Da organização do acervo à próxima grande descoberta de um aluno. A BibliotecAI conecta livros, pessoas e aprendizagem em uma só plataforma.</p>
          <div className="lp-actions"><a className="lp-button" href="#contato" onClick={() => trackClick('hero_cta_demonstracao')}>Conhecer a BibliotecAI <ArrowRight size={18} /></a><a className="lp-text-link" href="#na-pratica">Veja na prática <ArrowDownIcon /></a></div>
          <div className="lp-hero-note"><span className="lp-note-icon"><BookOpen size={18} /></span><span>Feita para a realidade<br /><strong>das bibliotecas escolares.</strong></span></div>
        </div>
        <div className="lp-hero-visual"><div className="lp-photo-frame"><img src={photo('gestao-biblioteca')} alt="BibliotecAI em uso real: bibliotecária gerenciando o acervo na biblioteca escolar" fetchPriority="high" /><div className="lp-photo-caption"><span className="lp-dot" /> BIBLIOTECA REAL. CONEXÕES REAIS.</div></div>
          <div className="lp-float-card"><span className="lp-float-icon"><Library size={23} /></span><div><strong>O acervo ganha vida.</strong><span>A tecnologia cuida da organização.<br />Você cuida das descobertas.</span></div></div><span className="lp-vertical-note">BIBLIOTECAI / EDUCAÇÃO EM MOVIMENTO</span>
        </div>
      </section>

      <div className="lp-principles"><div className="lp-container"><span>Uma plataforma.<br /><strong>Toda a comunidade escolar.</strong></span>{[[Library, 'Biblioteca organizada'], [Users, 'Pessoas conectadas'], [BookOpen, 'Leitura valorizada'], [Sparkles, 'Novas possibilidades']].map(([Icon, label]) => <span key={label}><Icon size={21} />{label}</span>)}</div></div>

      <section id="plataforma" className="lp-section lp-container">
        <div className="lp-section-heading"><div><span className="lp-eyebrow">MENOS BUROCRACIA. MAIS DESCOBERTAS.</span><h2>Tudo começa com um livro.<br />O resto, a gente conecta.</h2></div><p>Ferramentas que simplificam o dia a dia da biblioteca e abrem espaço para o que realmente importa: formar leitores.</p></div>
        <div className="lp-features">{features.map(([Icon, title, text], i) => <article key={title}><div className="lp-feature-top"><Icon size={25} strokeWidth={1.5} /><span>0{i + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section id="na-pratica" className="lp-practice"><LandingAtmosphere variant="section" /><div className="lp-container">
        <div className="lp-practice-heading"><span className="lp-eyebrow">DENTRO DA ESCOLA, DE VERDADE</span><h2>É sobre quem está<br />do outro lado da tela.</h2><p>A BibliotecAI faz parte da rotina. Conheça as experiências que se encontram na mesma biblioteca.</p></div>
        <div className="lp-tabs" role="tablist" aria-label="Experiências da plataforma">{Object.entries(experiences).map(([key, item]) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={key === audience} aria-controls="experience-panel" tabIndex={key === audience ? 0 : -1} onKeyDown={(event) => {
          const keys = Object.keys(experiences); let next;
          if (event.key === 'ArrowRight') next = keys[(keys.indexOf(key) + 1) % keys.length];
          if (event.key === 'ArrowLeft') next = keys[(keys.indexOf(key) + keys.length - 1) % keys.length];
          if (event.key === 'Home') next = keys[0];
          if (event.key === 'End') next = keys[keys.length - 1];
          if (next) { event.preventDefault(); setAudience(next); document.getElementById(`tab-${next}`)?.focus(); }
        }} onClick={() => setAudience(key)}>{item.label}</button>)}</div>
        <div id="experience-panel" role="tabpanel" aria-labelledby={`tab-${audience}`} className="lp-experience"><div className="lp-experience-image"><img key={current.image} src={photo(current.image)} alt={current.alt} loading="lazy" /><span>Registros reais da BibliotecAI em uso</span></div><div className="lp-experience-copy"><span className="lp-eyebrow">{current.label}</span><h3>{current.title}</h3><p>{current.text}</p><ul>{current.items.map((item) => <li key={item}><Check size={17} />{item}</li>)}</ul><a className="lp-text-link" href="#contato">Quero conhecer essa experiência <ArrowUpRight size={18} /></a></div></div>
      </div></section>

      <section className="lp-story lp-container"><div className="lp-story-copy"><span className="lp-eyebrow">O LIVRO CONTINUA NO CENTRO</span><h2>Tecnologia a serviço<br />de uma boa história.</h2><p>Uma estante cheia de livros é só o começo. A biblioteca acontece quando alguém encontra uma história, leva uma ideia para casa e volta querendo mais.</p><p>A BibliotecAI aproxima a organização desse encontro. Para a equipe, uma rotina mais simples. Para os alunos, mais caminhos para descobrir o prazer de ler.</p><a href="#como-funciona" className="lp-text-link">Leve essa ideia para sua escola <ArrowRight size={18} /></a></div><div className="lp-story-images"><figure><img src={photo('leitura')} alt="Aluno lendo um livro físico na biblioteca da escola" loading="lazy" /><figcaption>Novas histórias. Novos caminhos.</figcaption></figure><figure><img src={photo('acervo')} alt="Livros do acervo físico nas estantes da biblioteca escolar" loading="lazy" /><figcaption>Cada livro, uma possibilidade.</figcaption></figure></div></section>

      <HowItWorks theme={theme} />

      <section className="lp-faq lp-container lp-section"><div><span className="lp-eyebrow">PARA CONTINUAR A CONVERSA</span><h2>Algumas dúvidas.<br />Um bom começo.</h2></div><div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

      <section id="contato" className="lp-contact lp-container"><div><span className="lp-eyebrow">VAMOS ESCREVER ESSE CAPÍTULO?</span><h2>A próxima descoberta<br />pode começar<br /><em>na sua escola.</em></h2><p>Conte um pouco sobre a sua instituição. Vamos conversar sobre como a BibliotecAI pode fazer parte dela.</p><a href="mailto:contato@bibliotecai.com.br"><Mail size={18} />contato@bibliotecai.com.br</a></div><form onSubmit={prepareEmail}><h3>Conheça a BibliotecAI</h3><p>Prepare seu pedido de demonstração.</p><label htmlFor="lp-nome">Seu nome<input id="lp-nome" name="nome" autoComplete="name" required placeholder="Como podemos chamar você?" maxLength={120} /></label><label htmlFor="lp-email">E-mail<input id="lp-email" name="email" type="email" autoComplete="email" required placeholder="voce@escola.com.br" maxLength={200} /></label><label htmlFor="lp-escola">Escola ou instituição<input id="lp-escola" name="escola" autoComplete="organization" required placeholder="Nome da sua instituição" maxLength={200} /></label><label htmlFor="lp-mensagem">O que sua biblioteca precisa? <span>(opcional)</span><textarea id="lp-mensagem" name="mensagem" rows={3} placeholder="Conte um pouco sobre sua biblioteca…" maxLength={2000} /></label><button className="lp-button" type="submit">Preparar e-mail de contato <ArrowUpRight size={18} /></button><small>Seu aplicativo de e-mail será aberto com a mensagem pronta para você enviar.</small>{emailReady && <p className="lp-form-status" role="status">Mensagem preparada. Conclua o envio no seu aplicativo de e-mail. Se ele não abriu, escreva para contato@bibliotecai.com.br.</p>}</form></section>
    </main>
    <footer className="lp-footer"><div className="lp-container"><div><Brand /><p>Conectando livros, pessoas e aprendizagem.</p></div><div><a href="/auth">Acessar plataforma <ArrowUpRight size={14} /></a><a href="/privacidade">Política de privacidade</a><span>© {new Date().getFullYear()} BibliotecAI</span></div></div></footer>
  </div>;
}

function ArrowDownIcon() { return <ArrowRight size={17} style={{ transform: 'rotate(90deg)' }} />; }
