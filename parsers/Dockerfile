FROM public.ecr.aws/lambda/python:3.11

# Install system deps for OpenCV
RUN dnf install -y mesa-libGL && dnf clean all

# Copy schemas (needed for validation)
COPY schemas/canon/ ${LAMBDA_TASK_ROOT}/schemas/canon/

# Install Python deps
COPY parsers/pyproject.toml ${LAMBDA_TASK_ROOT}/
COPY parsers/src/ ${LAMBDA_TASK_ROOT}/src/
RUN pip install --no-cache-dir ${LAMBDA_TASK_ROOT}[easyocr]

# Copy the handler
COPY parsers/lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.handler"]
