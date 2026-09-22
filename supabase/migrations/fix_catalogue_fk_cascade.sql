-- catalogue_produits.added_by_business_id had no ON DELETE behavior, so deleting
-- a business whose catalogue_write plan had already cloned the central catalogue
-- (business/business_pro) was blocked by the FK constraint. A business's own
-- catalogue rows are meaningless without the business, so cascade the delete.

alter table catalogue_produits
  drop constraint if exists catalogue_produits_added_by_business_id_fkey;

alter table catalogue_produits
  add constraint catalogue_produits_added_by_business_id_fkey
  foreign key (added_by_business_id) references businesses(id) on delete cascade;
