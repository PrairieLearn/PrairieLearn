# Summary

A user-friendly interface for instructors to create and modify PrairieLearn questions and assessments.

# Table of Contents

1. [Motivation and Background](#motivation-and-background)
2. [Design](#design)

# Motivation and Background

Currently, creating a new PrairieLearn question involves manually writing HTML code, which can be a barrier to some instructors. This RFC proposes a more visual question editing process so that instructors can create questions much more easily. This should simplify the process of creating and modifying questions for instructors with no programming or HTML experience. It also proposes an interface for setting question and assessment configuration options.



# Design
* Preview screen of what the rendered question will look like (Overleaf-like?)
* Buttons for adding individual elements, and associated configurations
* IntelliSense-like documentation of elements on hover + auto-complete
    1. https://github.com/ajaxorg/ace/wiki/How-to-enable-Autocomplete-in-the-Ace-editor
    2. http://plnkr.co/edit/6MVntVmXYUbjR0DI82Cr?p=preview&preview
* Drag-and-drop of elements
* Origin of `data["params"]` in server.py comments (i.e. which element is this param a part of)
