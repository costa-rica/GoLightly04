# Database Management and Backup

The the admin page should have a section for database management and backup. This will have two main functions:

1. It will allow the admin user to create a backup of the database in the form of csv files saved to a folder titled "backup\_" + timestamp, where the timestamp is the current date and time in the format YYYYMMDD_HHMMSS. The backup should be then compressed into a zip file. The backup should be stored in the "backups_db" subdirectory of PATH_PROJECT_RESOURCES .env file path.

2. It will allow the admin user to restore the database from a backup file. The backup file should be a zip file containing the csv files for the database.

## Admin Database Backup Section

The section will display the backups where backups are listed by their filename. The filename will be clickable and will download the backup file. To the right of the filename will be a delete button that will delete the backup file.
