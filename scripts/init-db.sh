#!/bin/bash
set -euo pipefail

# Wait for SQL Server to accept connections
until /opt/mssql-tools/bin/sqlcmd -S db -U sa -P "$SA_PASSWORD" -Q "SELECT 1" > /dev/null 2>&1; do
  echo "Waiting for SQL Server to be available..."
  sleep 5
done

# Create database if it does not exist
/opt/mssql-tools/bin/sqlcmd -S db -U sa -P "$SA_PASSWORD" -Q "IF DB_ID('LibraryDB') IS NULL CREATE DATABASE LibraryDB;"

# Apply schema from DB.sql
/opt/mssql-tools/bin/sqlcmd -S db -U sa -P "$SA_PASSWORD" -d LibraryDB -i /scripts/DB.sql

echo "Database initialized with schema."
