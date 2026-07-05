FROM public.ecr.aws/lambda/python:3.11

# Copy schemas (needed for validation)
COPY schemas/canon/ ${LAMBDA_TASK_ROOT}/schemas/canon/

# Install dependencies directly (avoids needing hatchling build backend)
RUN pip install --no-cache-dir \
    opencv-python-headless>=4.8 \
    numpy>=1.24 \
    scipy>=1.10 \
    Pillow>=10.0 \
    pydantic>=2.0 \
    jsonschema>=4.20 \
    easyocr>=1.7

# Copy parser source as a package
COPY parsers/src/puzzle_parsers/ ${LAMBDA_TASK_ROOT}/puzzle_parsers/

# Copy the handler
COPY parsers/lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
