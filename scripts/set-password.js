/* =============================================================================
   DEFINIR SENHA DE UM USUÁRIO — direto, sem e-mail

   O console do Firebase não deixa mais editar a senha pela interface, e o
   "Redefinir senha" só manda um link (que aqui não está chegando). Este script
   usa o Admin SDK para setar a senha na hora.

   ---------------------------------------------------------------------------
   COMO USAR (é você quem roda — envolve a sua conta):

   1. Baixe a chave de serviço:
      Console do Firebase → Configurações do projeto (engrenagem) →
      aba "Contas de serviço" → "Gerar nova chave privada" → baixa um .json.
      Salve como  serviceAccount.json  nesta pasta (scripts/).
      NÃO comite esse arquivo — o .gitignore já bloqueia.

   2. Instale a dependência (uma vez):
        cd "D:/- Projetos -/Thurgh/_GitHub/Platform/scripts"
        npm install firebase-admin

   3. Rode, passando e-mail e a senha nova:
        node set-password.js guittkk@hotmail.com "SuaNovaSenha123"

   4. Entre no app imediatamente com essa senha:
        https://thurgh-lifeos.web.app
   ---------------------------------------------------------------------------
   ============================================================================= */

const path = require('path');
const admin = require('firebase-admin');

const [, , email, novaSenha] = process.argv;

if (!email || !novaSenha) {
  console.error('Uso: node set-password.js <email> "<nova senha>"');
  process.exit(1);
}
if (novaSenha.length < 6) {
  console.error('A senha precisa ter ao menos 6 caracteres (regra do Firebase).');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, 'serviceAccount.json'));
} catch (e) {
  console.error('Não achei scripts/serviceAccount.json. Veja o passo 1 no topo deste arquivo.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log('Usuário encontrado: uid=' + user.uid + '  criado em ' + user.metadata.creationTime);
    if (user.disabled) {
      console.log('Atenção: a conta está DESATIVADA — reativando junto.');
    }
    await admin.auth().updateUser(user.uid, {
      password: novaSenha,
      disabled: false,
      emailVerified: true
    });
    console.log('\n✓ Senha definida. Entre agora em https://thurgh-lifeos.web.app com:');
    console.log('  e-mail: ' + email);
    console.log('  senha:  a que você passou no comando');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.error('\nNão existe usuário com o e-mail "' + email + '".');
      console.error('Confira a grafia exata na lista Authentication → Users do console.');
    } else {
      console.error('\nFalhou:', err.message);
    }
    process.exit(1);
  }
})();
