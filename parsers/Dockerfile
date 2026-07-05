FROM public.ecr.aws/lambda/python:3.11

# Copy schemas (needed for validation)
COPY schemas/canon/ ${LAMBDA_TASK_ROOT}/schemas/canon/

# Install Python deps
# Install opencv-python-headless first (no system GL deps needed),
# then install the package with --no-deps for opencv since headless satisfies it
COPY parsers/pyproject.toml ${LAMBDA_TASK_ROOT}/
COPY parsers/src/ ${LAMBDA_TASK_ROOT}/src/
RUN pip install --no-cache-dir opencv-python-headless && \
    pip install --no-cache-dir ${LAMBDA_TASK_ROOT}[easyocr]

# Copy the handler
COPY parsers/lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
