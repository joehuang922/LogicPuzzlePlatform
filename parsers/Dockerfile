FROM public.ecr.aws/lambda/python:3.11

# Copy schemas (needed for validation)
COPY schemas/canon/ ${LAMBDA_TASK_ROOT}/schemas/canon/

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install all scientific deps with pinned versions that have binary wheels
RUN pip install --no-cache-dir \
    "numpy>=1.24,<2.1" \
    "Pillow>=10.0,<11" \
    "scipy>=1.10,<1.14" \
    "opencv-python-headless>=4.8,<4.11"

# Install PyTorch CPU-only
RUN pip install --no-cache-dir \
    torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu

# Install remaining deps — scipy/numpy/Pillow already satisfied
RUN pip install --no-cache-dir \
    pydantic>=2.0 \
    jsonschema>=4.20 \
    easyocr>=1.7 \
    "google-generativeai>=0.8"

# Pre-download EasyOCR models into the image
ENV EASYOCR_MODULE_PATH=${LAMBDA_TASK_ROOT}/models
RUN mkdir -p ${EASYOCR_MODULE_PATH} && \
    python -c "import easyocr; easyocr.Reader(['en'], gpu=False, download_enabled=True, model_storage_directory='${LAMBDA_TASK_ROOT}/models')"

# Copy parser source
COPY parsers/src/puzzle_parsers/ ${LAMBDA_TASK_ROOT}/puzzle_parsers/

# Blank ALL __init__.py files to prevent import chains that pull in anthropic
RUN echo "" > ${LAMBDA_TASK_ROOT}/puzzle_parsers/__init__.py && \
    echo "" > ${LAMBDA_TASK_ROOT}/puzzle_parsers/combo_sudoku/__init__.py && \
    echo "" > ${LAMBDA_TASK_ROOT}/puzzle_parsers/sudoku/__init__.py && \
    echo "" > ${LAMBDA_TASK_ROOT}/puzzle_parsers/nurimaze/__init__.py

# Patch out ClaudeOcrBackend import from sudoku/parser.py (it's not used in container)
RUN sed -i 's/from puzzle_parsers.combo_sudoku.ocr import ClaudeOcrBackend, OcrBackend/from puzzle_parsers.combo_sudoku.ocr import OcrBackend/' \
    ${LAMBDA_TASK_ROOT}/puzzle_parsers/sudoku/parser.py && \
    sed -i 's/from puzzle_parsers.combo_sudoku.ocr import ClaudeOcrBackend, OcrBackend/from puzzle_parsers.combo_sudoku.ocr import OcrBackend/' \
    ${LAMBDA_TASK_ROOT}/puzzle_parsers/combo_sudoku/parser.py

# Copy the handler
COPY parsers/lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
