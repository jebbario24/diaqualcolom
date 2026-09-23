-- Cut over plans.paddle_price_id / paddle_price_alt_id from sandbox to live
-- Paddle price ids. Price ids are public identifiers, not secrets -- safe to
-- commit (same as the sandbox version of this migration).
--
-- IMPORTANT: this must run in the SAME deploy window as flipping
-- PADDLE_ENVIRONMENT to "production" (Supabase secret) and the client-side
-- token in index.html to a live_... token -- sandbox price ids and the live
-- API host are mutually incompatible. Until Paddle approves the
-- diaqualcolom.jebbario20.workers.dev domain and verifies the account,
-- checkout will fail outright (not accidentally charge anyone) -- this is
-- expected during the verification window.

update plans set paddle_price_id = 'pri_01m361djj23jwaq75gx3nt9j2j' where id = 'cps';
update plans set paddle_price_id = 'pri_01m361dkh6pgw0mepnszpjq2mv' where id = 'proprietaire';
update plans set paddle_price_id = 'pri_01m361dmgrm5hbcrcykp13mdqk' where id = 'installateur';
update plans set paddle_price_id = 'pri_01m361dn1w1d5f7j9fzwnpqsmt',
                  paddle_price_alt_id = 'pri_01m361dn521yfncsmzt33zdfp9'
  where id = 'business';
update plans set paddle_price_id = 'pri_01m361dp2sqmctw2v46637by2w' where id = 'business_pro';

select id, price_mad, price_alt_mad, paddle_price_id, paddle_price_alt_id from plans order by id;
