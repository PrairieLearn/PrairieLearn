
.PHONY: text

comma := ,
CONFIG_QUESTIONS_DIR := $(shell grep -s questionsDir config.json)
CONFIG_QUESTIONS_DIR := $(strip $(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(patsubst "questionsDir":%,%,$(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(strip $(CONFIG_QUESTIONS_DIR))
CONFIG_QUESTIONS_DIR := $(patsubst "%"$(comma),%,$(CONFIG_QUESTIONS_DIR))
QUESTIONS_DIR := $(if $(CONFIG_QUESTIONS_DIR),$(CONFIG_QUESTIONS_DIR),questions)

CONFIG_CLIENTCODE_DIR := $(shell grep -s clientCodeDir config.json)
CONFIG_CLIENTCODE_DIR := $(strip $(CONFIG_CLIENTCODE_DIR))
CONFIG_CLIENTCODE_DIR := $(patsubst "clientCodeDir":%,%,$(CONFIG_CLIENTCODE_DIR))
CONFIG_CLIENTCODE_DIR := $(strip $(CONFIG_CLIENTCODE_DIR))
CONFIG_CLIENTCODE_DIR := $(patsubst "%"$(comma),%,$(CONFIG_CLIENTCODE_DIR))
CLIENTCODE_DIR := $(if $(CONFIG_CLIENTCODE_DIR),$(CONFIG_CLIENTCODE_DIR),clientCode)

text:
	../tool/generate_text.py ../frontend/text $(QUESTIONS_DIR)
	../tool/generate_text.py ../frontend/text $(CLIENTCODE_DIR)
