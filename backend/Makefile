
.PHONY: text

comma := ,
CONFIG_QUESTIONS_DIR := $(shell grep -s questionsDir config.json)
CONFIG_QUESTIONS_DIR := $(strip $(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(patsubst "questionsDir":%,%,$(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(strip $(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(patsubst "%"$(comma),%,$(CONFIG_QUESTIONS_DIR))

QUESTIONS_DIR := $(if $(CONFIG_QUESTIONS_DIR),$(CONFIG_QUESTIONS_DIR),../backend/questions)

text:
	cd ../frontend ; ../tool/generate_text.py $(QUESTIONS_DIR)/*/*.js
