package agent

import "database/sql"

// Database is for controller business services only, never HTTP clients.
func (r *Registry) Database() *sql.DB { return r.db }
