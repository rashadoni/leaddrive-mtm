package com.mtmobileapp

import androidx.core.content.FileProvider

/** A dedicated provider avoids relying on direct FileProvider instantiation. */
class PresentationFileProvider : FileProvider(R.xml.presentation_file_paths)
