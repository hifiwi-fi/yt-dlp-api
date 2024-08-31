from setuptools import setup
from setuptools.command.install import install
import os
import shutil

class PostInstallCommand(install):
    """Post-installation for installation mode."""
    def run(self):
        target_dir = './venv/lib/python3.12/site-packages/yt_dlp_plugins/extractor'
        source_file = 'getpot_bgutil.py'

        # Debug output
        print(f"Creating directory: {target_dir}")

        # Create the target directory if it doesn't exist
        os.makedirs(target_dir, exist_ok=True)

        # Debug output
        print(f"Copying {source_file} to {target_dir}")

        # Copy the file
        shutil.copy(source_file, os.path.join(target_dir, source_file))

        # Debug output
        print(f"File {source_file} copied successfully to {target_dir}")

        # Continue with the standard install process
        install.run(self)

setup(
    name='yt-dlp-api',
    version='0.0.0',
    # Other setup arguments...
    cmdclass={
        'install': PostInstallCommand,
    },
)
