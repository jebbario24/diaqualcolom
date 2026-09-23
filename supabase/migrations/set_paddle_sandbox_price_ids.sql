-- Populate the Paddle sandbox price ids created in the Paddle Sandbox Dashboard
-- (Catalog > Products), one per AquaLC plan. Price ids are public identifiers,
-- not secrets (same as the old stripe_price_id values) -- safe to commit.
--
-- Run after migrate_stripe_to_paddle.sql (which creates the paddle_price_id /
-- paddle_price_alt_id columns).

update plans set paddle_price_id = 'pri_01m35xg5w9gd88wbyy84mrwsyr' where id = 'cps';
update plans set paddle_price_id = 'pri_01m35xn566w51kg4pxd9tskaj1' where id = 'proprietaire';
update plans set paddle_price_id = 'pri_01m35xphee147rr50rf3era6mq' where id = 'installateur';
update plans set paddle_price_id = 'pri_01m35xqwannf84wdnbe89163rs',
                  paddle_price_alt_id = 'pri_01m35xsfn2qfphtyt6ast1n2fm'
  where id = 'business';
update plans set paddle_price_id = 'pri_01m35xw722g5zvb22j3wakh48r' where id = 'business_pro';

-- Sanity check: every row should now have a non-null paddle_price_id
-- (business_pro has no alt, so paddle_price_alt_id null there is expected).
select id, price_mad, price_alt_mad, paddle_price_id, paddle_price_alt_id from plans order by id;
