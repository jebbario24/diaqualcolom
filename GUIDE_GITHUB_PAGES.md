# AquaLC — hébergement sur GitHub Pages

Le site est un fichier statique (`index.html` + `config.js` + `vendor/`).
Tout le dynamique (comptes, données, paiement) est chez Supabase.
GitHub Pages sert ce fichier, gratuitement, et se met à jour à chaque
`git push`.

---

## 1. Vérifier que c'est activé

**https://github.com/jebbario24/aqualc/settings/pages**

Tu dois voir :
- **Source** : *Deploy from a branch*
- **Branch** : `main` — dossier `/ (root)`
- En haut : *« Your site is live at https://jebbario24.github.io/aqualc/ »*

Si ce n'est pas le cas : règle Source = *Deploy from a branch*, Branch =
`main` / `/ (root)`, **Save**, attends 1–2 min.

## 2. Comment ça se met à jour

- Chaque `git push` sur `main` déclenche un déploiement (~1 min).
- Suivi : onglet **Actions** du dépôt → workflow *pages build and deployment*.
- Coche verte = en ligne. Puis **Ctrl+Shift+R** sur le site pour forcer le
  rafraîchissement du cache navigateur.

## 3. Ce que GitHub Pages sert

Racine du dépôt → racine du site :

| Fichier | URL |
|---|---|
| `index.html` | `https://jebbario24.github.io/aqualc/` |
| `config.js` | `https://jebbario24.github.io/aqualc/config.js` |
| `vendor/supabase-js.js` | `https://jebbario24.github.io/aqualc/vendor/supabase-js.js` |

Les fichiers `.md`, `.sql`, `supabase/`, `stripe/` sont aussi servis (visibles
si on tape l'URL) mais **inoffensifs** : le SQL/les fonctions ne s'exécutent
pas côté navigateur, et il n'y a aucun secret dedans (la clé `anon` est
publique par conception). Si tu préfères les cacher, on ajoutera un
`.nojekyll` + un petit build ; pas prioritaire.

## 4. Domaine personnalisé (`aqualc.com`)

### a. Chez ton registrar (là où tu as acheté le domaine)

Ajoute ces enregistrements DNS :

**Option recommandée — apex `aqualc.com` :**
```
Type  Nom   Valeur
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
AAAA  @     2606:50c0:8000::153
AAAA  @     2606:50c0:8001::153
AAAA  @     2606:50c0:8002::153
AAAA  @     2606:50c0:8003::153
```

**Et le sous-domaine `www` :**
```
Type   Nom   Valeur
CNAME  www   jebbario24.github.io.
```

### b. Chez GitHub

**Settings → Pages → Custom domain** → tape `aqualc.com` → **Save**.
GitHub crée un fichier `CNAME` dans le dépôt (laisse-le).
Attends la propagation DNS (10 min à 1 h), puis coche **« Enforce HTTPS »**.

### c. Mettre à jour 3 endroits

1. **`config.js`** → `appOrigin: 'https://aqualc.com'` → commit + push
2. **Supabase → Authentication → URL Configuration** → *Site URL* et
   *Redirect URLs* = `https://aqualc.com`
3. **Secret Supabase** (pour Stripe) :
   ```bash
   supabase secrets set AQUA_APP_ORIGIN=https://aqualc.com
   ```
   (les `success_url` / `return_url` Stripe suivent automatiquement)

## 5. Limites de GitHub Pages (aucune ne nous gêne)

| Limite | Impact AquaLC |
|---|---|
| Fichiers statiques uniquement | ✅ le backend est chez Supabase |
| Dépôt public | ✅ le code front est déjà public, aucun secret dedans |
| ~100 Go/mois de bande passante, build ≤ 10 min | ✅ très loin des seuils |
| Pas de redirections serveur | ✅ pas besoin |

Si un jour tu veux des *preview deployments* par branche ou un tableau de
bord d'analytics intégré → **Vercel** ou **Cloudflare Pages** (gratuits,
même principe : connecter le dépôt GitHub). Migration = 5 min, rien à
changer dans le code. Mais pas nécessaire aujourd'hui.
