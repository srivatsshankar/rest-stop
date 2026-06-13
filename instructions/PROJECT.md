# Reststop

Reststop is a simple desktop app for backups.

It uses [restic](https://restic.net/) in the background and gives users an easy interface so they do not need to use the command line.

## Goal

* Make backups easy for everyday users
* Keep the app simple and lightweight
* Use restic for the actual backup and restore work
* Avoid building a custom scheduler, queue, or retry system

## Technology

* Electron
* restic
* Tailwind CSS
* Font Awesome
* Atkinson Hyperlegible Next

## First Launch

* Check if restic is installed
* Install restic if it is missing
* Open the main screen after setup

## Main Screen

* Show two main buttons when there are no backups:

  * Create backup
  * Restore backup

* Show existing backups in a simple list

* Each backup should show:

  * Name
  * Expected next run
  * Current status, if available

* Clicking a backup should show:

  * Status
  * Backup location
  * Selected files and folders
  * Retention settings
  * Progress details

* Each backup should have actions for:

  * Edit backup
  * Run backup now

* Show backup progress when available

* Show an indeterminate progress bar if only the running process is detected

* Include a top-right menu with:

  * Create new backup
  * Restore from backup

## Create Backup

* Ask for backup details:

  * Name
  * Description
  * Encryption option
  * Password, if encryption is enabled

* Ask for backup location:

  * Local folder
  * External drive
  * Network location
  * Remote restic backend
  * rclone backend

* Use a file or folder picker for simple locations

* Guide the user through login when a remote location needs authentication

* Ask which files and folders to back up

* Clearly show the selected files and folders

* Allow optional exclusion patterns for:

  * Temporary files
  * Build folders
  * Caches
  * Logs
  * Other unnecessary files

* Ask for backup frequency:

  * Only when I run it
  * Every N minutes
  * Every N hours
  * Every N days
  * Every N weeks
  * Every N months
  * Every N years

* Save and display the frequency, but do not implement a custom scheduler

* Ask for retention settings:

  * Keep all backups while storage is available
  * Keep backups for a set number of years
  * Keep a fixed number of recent backups

* Show a final summary before creating the backup:

  * Backup name
  * Backup location
  * Selected files and folders
  * Exclusion rules
  * Backup frequency
  * Retention policy
  * Encryption status

## Restore Backup

* Let the user choose a backup:

  * Existing backup
  * Manual backup location

* Let the user choose files or folders to restore

* Let the user choose where restored files should go:

  * Original location
  * New folder
  * Custom location

* Warn the user if files may be overwritten

* Show a final summary before restoring:

  * Selected backup
  * Selected files and folders
  * Restore location
  * Overwrite warnings

## Design

* Keep the app simple
* Use clear language
* Use large, readable text
* Use simple buttons and forms
* Avoid clutter
* Use helpful explanations
* Use safe defaults
* Make mistakes easy to recover from
* Keep advanced options out of the way

## Summary

Reststop is a simple GUI for restic.

It helps users create, manage, and restore backups without using the command line.
