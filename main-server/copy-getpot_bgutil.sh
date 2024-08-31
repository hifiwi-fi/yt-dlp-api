#!/bin/sh

# Get the directory of the script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define variables relative to the script location
target_dir="$script_dir/venv/lib/python3.12/site-packages/yt_dlp_plugins/extractor"
source_file="$script_dir/getpot_bgutil.py"

# Debug output
echo "Creating directory: $target_dir"

# Create the target directory if it doesn't exist
mkdir -p "$target_dir"

# Debug output
echo "Copying $source_file to $target_dir"

# Copy the file
cp "$source_file" "$target_dir/"

# Debug output
echo "File $(basename "$source_file") copied successfully to $target_dir"
