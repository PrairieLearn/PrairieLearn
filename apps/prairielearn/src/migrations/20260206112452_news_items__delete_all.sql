DELETE FROM news_items;
-- News item notifications will be deleted via the foreign key cascade, so they
-- don't need to be deleted explicitly.