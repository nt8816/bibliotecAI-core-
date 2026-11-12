# Prévia local da landing page

Execute `npm run dev:landing` na raiz do projeto. O Vite abre `/landing` no navegador e atualiza a página conforme os arquivos são salvos. Use o endereço exibido no terminal (normalmente http://127.0.0.1:8080/landing).

O conteúdo está em `src/pages/LandingPage.jsx` e o visual em `src/pages/LandingPage.css`. A página também é exibida na rota `/` em navegadores web, preservando o redirecionamento nativo do aplicativo.

## Fotos

Os arquivos WebP em `public/landing-photos/` são versões compactadas das fotos fornecidas em Downloads. Os originais em Downloads foram preservados. Recortes, brilho e saturação são ajustados pelo CSS, sem reconstruir a interface nas telas fotografadas.

| Arquivo no site | Original em Downloads |
| --- | --- |
| gestao-biblioteca.webp | IMG_20260407_150009.jpg |
| aluno-plataforma.webp | IMG_20260415_122324.jpg |
| bibliotecaria.webp | IMG_20260407_145901.jpg |
| leitura.webp | IMG_20260429_081510.jpg |
| acervo.webp | IMG_20260407_150142.jpg |
| logo.webp | IMG-20260327-WA0307.jpg |

`biblioteca-editada-ia.png` é uma alternativa com enquadramento ajustado por IA. Ela está disponível para avaliação em `/landing-photos/biblioteca-editada-ia.png`, mas a página utiliza as fotografias originais para manter fidelidade às pessoas e às telas da plataforma.

## Contato e validação

A seção **Como funciona** oferece três percursos, com nove prints da interface atual e instruções específicas para cada etapa:

| Perfil | Etapas e prints |
| --- | --- |
| Alunos | Biblioteca, perfil e conquistas, atividades |
| Professores | Meus alunos, criação de atividades, relatórios de leitura |
| Gestores | Dashboard, usuários da instituição, relatórios de gestão |

Cada perfil apresenta suas áreas de interesse. Os botões de etapa e os controles Anterior/Próximo passo atualizam a captura e as instruções; trocar o perfil retorna à primeira etapa. Os arquivos PNG em `public/product-screens/` podem ser ampliados e baixados pela própria seção.

As capturas foram feitas nas respectivas páginas locais, com dados fictícios fornecidos apenas ao navegador de captura. A autenticação do aplicativo não foi alterada e registros de produção não foram utilizados. Os números ilustram a demonstração e não representam métricas reais de uma escola. Os três prints anteriores de biblioteca continuam disponíveis na pasta como material complementar.

O formulário prepara uma mensagem no aplicativo de e-mail do visitante; o envio é concluído nesse aplicativo. Não há confirmação de entrega nem envio automático.

Verificação: `npm run build:web`. As abas, a navegação móvel, as perguntas frequentes e a preparação de contato foram verificadas no navegador local. A apresentação foi conferida em larguras de 390, 768 e 1440 pixels.
