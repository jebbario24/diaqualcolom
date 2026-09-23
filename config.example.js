/* -------------------------------------------------------------------------
 * AquaLC — configuration du backend.
 *
 * 1. Copiez ce fichier et renommez la copie en :  config.js
 * 2. Renseignez les deux valeurs ci-dessous (Supabase > Project Settings > API)
 * 3. Enregistrez.  C'est tout — vous n'y toucherez plus.
 *
 * `config.js` n'est pas suivi par Git : vos identifiants restent chez vous,
 * et une nouvelle version de index.html ne les efface jamais.
 *
 * N'utilisez JAMAIS ici la clé `service_role` — uniquement la clé « anon ».
 * ---------------------------------------------------------------------- */
window.AQUA_SUPABASE = {
  url: '',       // ex. https://xxxxxxxxxxxx.supabase.co
  anonKey: '',   // Project Settings > API > Project API keys > anon / public
  appOrigin: ''  // adresse publique du site (ex. https://aqualc.com) — pour les liens de boutique
};

/* Paddle (facturation). Le jeton client est public par nature (comme la clé
 * anon de Supabase) : il ne peut qu'ouvrir un paiement, jamais débiter ni lire
 * de données. Paddle Dashboard > Developer Tools > Authentication.
 */
window.AQUA_PADDLE = {
  clientToken: '',        // jeton client Paddle (test_... ou live_...)
  environment: 'sandbox'  // 'sandbox' en test, 'production' en production
};
