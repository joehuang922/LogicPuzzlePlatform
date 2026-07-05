FROM public.ecr.aws/lambda/python:3.11

# Copy schemas (needed for validation)
COPY schemas/canon/ ${LAMBDA_TASK_ROOT}/schemas/canon/

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install all scientific deps with pinned versions that have binary wheels
# for manylinux x86_64 Python 3.11 (no compiler needed)
RUN pip install --no-cache-dir \
    "numpy>=1.24,<2.1" \
    "Pillow>=10.0,<11" \
    "scipy>=1.10,<1.14" \
    "opencv-python-headless>=4.8,<4.11"

# Install PyTorch CPU-only
RUN pip install --no-cache-dir \
    torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu

# Install remaining deps (easyocr and others) — scipy/numpy/Pillow already satisfied
RUN pip install --no-cache-dir \
    pydantic>=2.0 \
    jsonschema>=4.20 \
    easyocr>=1.7

# Pre-download EasyOCR models into a fixed path baked into the image
ENV EASYOCR_MODULE_PATH=${LAMBDA_TASK_ROOT}/models
RUN mkdir -p ${EASYOCR_MODULE_PATH} && \
    python -c "import easyocr; easyocr.Reader(['en'], gpu=False, download_enabled=True, model_storage_directory='${LAMBDA_TASK_ROOT}/models')"

# Copy parser source as a package
COPY parsers/src/puzzle_parsers/ ${LAMBDA_TASK_ROOT}/puzzle_parsers/

# Copy the handler
COPY parsers/lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
