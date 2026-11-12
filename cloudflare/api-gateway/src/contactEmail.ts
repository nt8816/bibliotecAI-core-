type Contact = { nome: string; email: string; escola: string; assunto: string; mensagem: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function layout(title: string, content: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f6f1;font-family:Arial,sans-serif;color:#243a29"><div style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3ede4"><div style="background:#174d2b;padding:28px;color:#fff"><div style="font-size:24px;font-weight:bold">BibliotecAI</div><div style="margin-top:7px;color:#cbe8cf;font-size:13px">Tecnologia que aproxima pessoas e livros</div></div><div style="padding:30px"><h1 style="font-size:22px;margin:0 0 18px;color:#174d2b">${title}</h1>${content}</div><div style="background:#f3f7f2;padding:20px 30px;color:#627567;font-size:12px;line-height:1.6">Equipe BibliotecAI<br>Gestão inteligente para bibliotecas escolares<br><a href="https://bibliotecai.com.br" style="color:#246238">bibliotecai.com.br</a></div></div></body></html>`;
}

export function contactNotification(contact: Contact) {
  const { nome, email, escola, assunto, mensagem } = contact;
  const details = [['Nome', nome], ['E-mail', email], ['Escola', escola || 'Não informada'], ['Assunto', assunto]];
  const rows = details.map(([label, value]) => `<tr><td style="padding:8px 12px;color:#627567;font-weight:bold;vertical-align:top">${label}</td><td style="padding:8px 12px;word-break:break-word">${escapeHtml(value)}</td></tr>`).join('');
  return {
    subject: `Novo contato pelo site — ${assunto}`,
    text: `Uma nova mensagem chegou pelo site da BibliotecAI.\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nMensagem:\n${mensagem}\n\nResponda a este email para falar diretamente com a pessoa.`,
    html: layout('Uma nova conversa começou!', `<p style="line-height:1.6">Alguém entrou em contato pelo site. Confira os dados abaixo e responda a este email para conversar diretamente com a pessoa.</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f4f8f3;border-radius:8px">${rows}</table><h2 style="font-size:16px;margin:24px 0 10px;color:#174d2b">Mensagem recebida</h2><div style="padding:16px;background:#faf8f0;border-left:4px solid #d3ad58;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6">${escapeHtml(mensagem)}</div>`),
  };
}

// Models for the future customer-facing contact and technical-support flows.
// Sending is deliberately separate: it requires an unrestricted, authorized binding.
export function customerEmail(nome: string, mensagem: string, assunto: string) {
  return {
    subject: assunto,
    text: `Olá, ${nome}!\n\n${mensagem}\n\nEquipe BibliotecAI\nhttps://bibliotecai.com.br`,
    html: layout('Olá, ' + escapeHtml(nome) + '!', `<p style="line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(mensagem)}</p><p style="line-height:1.6">Com carinho,<br><strong>Equipe BibliotecAI</strong></p>`),
  };
}
