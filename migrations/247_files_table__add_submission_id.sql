ADD CONSTRAINT files_submissions_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON UPDATE CASCADE ON DELETE SET NULL;
