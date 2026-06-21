# Rest Stop

– Rest Stop is a GUI for restic and rclone.
– It is designed to provide a simple interface to create restic backups.
– It needs to be simple enough for even non-technical users to create.
– Once setup it does not need to be adjusted until it is time to restore.
– It supports many different backends including those with rclone.Now
– Some of the backups include Google Drive, OneDrive, Mega, S3, and others.
– It initializes on start and lives in the system tray to operate in the background.
– It is meant to be lightweight and reliable.
– When implementing a backend check to see if all of the necessary flags are implemented to ensure stability and speed, especially those using rclone, so as to avoid throttling and connection failure.
– Whenever introducing new sections in different menus, like settings, remember to have enough spacing between the heading of the new section and the previous section