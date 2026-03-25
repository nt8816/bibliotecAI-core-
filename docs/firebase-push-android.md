# Push Android do BibliotecAi

O projeto ja ficou preparado para registrar o token do aparelho Android e organizar os canais nativos:

- `Comunicados`
- `Mensagens da Bibliotecaria`
- `Atividades`

## Arquivo pendente no app Android

Quando voce criar o app Android no Firebase, coloque o arquivo baixado exatamente aqui:

`android/app/google-services.json`

Sem esse arquivo, o APK continua abrindo normalmente, mas o registro nativo do push nao conclui.

## O que ja esta pronto

- bridge nativo no app: `src/components/NativePushBridge.jsx`
- rotas para registrar e remover token do aparelho:
  - `/v1/notifications/push/register`
  - `/v1/notifications/push/unregister`
- tabela de tokens no banco:
  - `public.push_device_tokens`

## Depois que voce colocar o arquivo

1. Rode `npm run build`
2. Rode `npx cap sync android`
3. Gere o APK novamente em `android/`

## Pendencia final para push com o app fechado

O arquivo `google-services.json` resolve a parte do app Android.

Para a mensagem chegar mesmo com o app fechado, ainda falta ligar o backend ao Firebase Cloud Messaging para enviar os pushes usando credenciais do projeto Firebase.

Quando voce tiver esse projeto Firebase criado, o ideal e me passar tambem:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Com isso eu consigo completar o disparo do backend para `Comunicados`, `Mensagens` e `Atividades`.
