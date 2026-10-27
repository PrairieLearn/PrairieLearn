import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.multipdf.PDFCloneUtility;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.multipdf.Splitter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.PDStructureElementNameTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDAction;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionGoTo;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDNamedDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode;

/**
 * Usage: PrintPdf.java merge OUTPUT TITLE LANGUAGE INPUTS.tsv
 * Each manifest line contains an input path, first page, and last page separated by tabs.
 * Page ranges are inclusive and one-based. Use 0 0 for a complete input document.
 * Each input occurrence gets independent structure and annotation references.
 */
class PrintPdf {
  private static final COSName HEADERS = COSName.getPDFName("Headers");

  public static void main(String[] args) throws IOException {
    try {
      merge(args);
    } catch (UnsupportedPdfException error) {
      System.err.println("PDF accessibility: " + error.getMessage());
      System.exit(2);
    }
  }

  private static void merge(String[] args) throws IOException {
    if (args.length != 5 || !args[0].equals("merge")) {
      throw new IllegalArgumentException(
          "Usage: merge OUTPUT TITLE LANGUAGE INPUTS.tsv");
    }
    List<String> parts = Files.readAllLines(Path.of(args[4]));
    if (parts.isEmpty()) throw new IOException("A PDF packet must contain at least one document.");
    PDFMergerUtility merger = new PDFMergerUtility();
    merger.setDocumentMergeMode(PDFMergerUtility.DocumentMergeMode.PDFBOX_LEGACY_MODE);
    try (PDDocument packet = new PDDocument()) {
      for (int i = 0; i < parts.size(); i++) {
        String[] input = parts.get(i).split("\t", -1);
        if (input.length != 3) throw new IOException("Invalid PDF packet manifest entry.");
        try (PDDocument source = Loader.loadPDF(new File(input[0]))) {
          Set<COSBase> resources = Collections.newSetFromMap(new IdentityHashMap<>());
          for (var page : source.getPages()) rejectTaggedForms(page.getResources(), resources);
          normalizeLocalDestinations(source);
          int first = Integer.parseInt(input[1]);
          int last = Integer.parseInt(input[2]);
          if (first == 0 && last == 0) {
            appendDocument(merger, packet, source, "part" + i + "_");
          } else {
            if (first < 1 || last < first || last > source.getNumberOfPages()) {
              throw new IOException("Invalid page range for " + input[0]);
            }
            Splitter splitter = new Splitter();
            splitter.setStartPage(first);
            splitter.setEndPage(last);
            splitter.setSplitAtPage(source.getNumberOfPages());
            List<PDDocument> sections = splitter.split(source);
            try {
              for (PDDocument part : sections) {
                normalizeLocalDestinations(part);
                appendDocument(merger, packet, part, "part" + i + "_");
              }
            } finally {
              for (PDDocument part : sections) part.close();
            }
          }
        }
      }
      packet.getDocumentInformation().setTitle(args[2]);
      packet.getDocumentCatalog().setLanguage(args[3]);
      packet.save(args[1]);
    }
  }

  /** Named destinations collide across copies; explicit page references are cloned independently. */
  private static void normalizeLocalDestinations(PDDocument document) throws IOException {
    Set<COSDictionary> pages = Collections.newSetFromMap(new IdentityHashMap<>());
    for (var page : document.getPages()) pages.add(page.getCOSObject());
    for (var page : document.getPages()) {
      for (var annotation : page.getAnnotations()) {
        if (annotation instanceof PDAnnotationLink link) {
          if (link.getDestination() != null) {
            link.setDestination(resolveDestination(document, link.getDestination(), pages));
          }
          normalizeAction(document, link.getAction(), pages);
        }
      }
    }
    var catalog = document.getDocumentCatalog();
    var open = catalog.getOpenAction();
    if (open instanceof PDDestination destination) {
      catalog.setOpenAction(resolveDestination(document, destination, pages));
    } else if (open instanceof PDAction action) {
      normalizeAction(document, action, pages);
    }
    if (catalog.getDocumentOutline() != null) {
      normalizeOutline(document, catalog.getDocumentOutline(), pages);
    }
  }

  private static void normalizeOutline(
      PDDocument document, PDOutlineNode outline, Set<COSDictionary> pages) throws IOException {
    for (var item : outline.children()) {
      if (item.getDestination() != null) {
        item.setDestination(resolveDestination(document, item.getDestination(), pages));
      }
      normalizeAction(document, item.getAction(), pages);
      normalizeOutline(document, item, pages);
    }
  }

  private static void normalizeAction(
      PDDocument document, PDAction action, Set<COSDictionary> pages) throws IOException {
    if (action instanceof PDActionGoTo goTo) {
      goTo.setDestination(resolveDestination(document, goTo.getDestination(), pages));
    }
  }

  private static PDPageDestination resolveDestination(
      PDDocument document, PDDestination destination, Set<COSDictionary> pages) throws IOException {
    if (destination instanceof PDNamedDestination named) {
      destination = document.getDocumentCatalog().findNamedDestinationPage(named);
    }
    if (!(destination instanceof PDPageDestination target) || target.getPage() == null
        || !pages.contains(target.getPage().getCOSObject())) {
      throw new UnsupportedPdfException(
          "This PDF has an internal link whose target is missing from its document section. "
              + "Re-export the cover with working internal links, or omit the uploaded cover.");
    }
    return target;
  }

  private static void rejectTaggedForms(PDResources resources, Set<COSBase> seen)
      throws IOException {
    if (resources == null || !seen.add(resources.getCOSObject())) return;
    for (COSName name : resources.getXObjectNames()) {
      if (resources.getXObject(name) instanceof PDFormXObject form) {
        // PDFBox 3.0.8 reconnects page and annotation structure, but not tagged Form XObjects.
        if (form.getStructParents() >= 0) {
          throw new UnsupportedPdfException(
              "Packet assembly cannot preserve tagged form content in this PDF. "
                  + "Re-export the cover as an accessible PDF from a supported source, "
                  + "or omit the uploaded cover.");
        }
        rejectTaggedForms(form.getResources(), seen);
      }
    }
  }

  private static class UnsupportedPdfException extends IOException {
    UnsupportedPdfException(String message) {
      super(message);
    }
  }

  private static void appendDocument(
      PDFMergerUtility merger, PDDocument packet, PDDocument source, String prefix)
      throws IOException {
    prepareStructure(source, prefix);
    merger.appendDocument(packet, source);
    COSDictionary classes = source.getDocumentCatalog().getStructureTreeRoot()
        .getCOSObject().getCOSDictionary(COSName.CLASS_MAP);
    if (classes == null) return;
    COSDictionary root = packet.getDocumentCatalog().getStructureTreeRoot().getCOSObject();
    COSDictionary mergedClasses = root.getCOSDictionary(COSName.CLASS_MAP);
    if (mergedClasses == null) {
      mergedClasses = new COSDictionary();
      root.setItem(COSName.CLASS_MAP, mergedClasses);
    }
    // PDFBox merges structure trees but omits ClassMap. Keep classes separate from direct
    // attributes so /A continues to override /C, including their original revision numbers.
    var cloner = new ClassCloner(packet);
    for (COSName name : classes.keySet()) {
      mergedClasses.setItem(name, cloner.cloneForNewDocument(classes.getDictionaryObject(name)));
    }
  }

  private static class ClassCloner extends PDFCloneUtility {
    ClassCloner(PDDocument document) {
      super(document);
    }
  }

  /** Make source-local identifiers and inherited semantics independent of the new catalog. */
  private static void prepareStructure(PDDocument document, String prefix) throws IOException {
    var catalog = document.getDocumentCatalog();
    var tree = catalog.getStructureTreeRoot();
    if (tree == null) throw new IOException("Input PDF has no accessibility structure.");
    COSDictionary root = tree.getCOSObject();
    COSDictionary classes = root.getCOSDictionary(COSName.CLASS_MAP);
    COSDictionary roles = root.getCOSDictionary(COSName.ROLE_MAP);
    String language = catalog.getLanguage();
    Map<String, PDStructureElement> identifiers = new LinkedHashMap<>();
    Set<COSBase> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    Set<COSBase> attributes = Collections.newSetFromMap(new IdentityHashMap<>());
    List<COSDictionary> topLevel = structureChildren(root.getDictionaryObject(COSName.K));
    for (COSDictionary element : topLevel) {
      if (language != null && !element.containsKey(COSName.LANG)) {
        element.setString(COSName.LANG, language);
      }
      prepareElement(element, prefix, classes, roles, identifiers, seen, attributes);
    }
    if (!identifiers.isEmpty()) {
      var idTree = new PDStructureElementNameTreeNode();
      idTree.setNames(identifiers);
      tree.setIDTree(idTree);
    } else {
      root.removeItem(COSName.ID_TREE);
    }
    if (classes != null) {
      COSDictionary renamedClasses = new COSDictionary();
      for (COSName name : classes.keySet()) {
        COSBase definition = classes.getDictionaryObject(name);
        renameHeaders(definition, prefix, attributes);
        renamedClasses.setItem(COSName.getPDFName(prefix + name.getName()), definition);
      }
      root.setItem(COSName.CLASS_MAP, renamedClasses);
    }
    root.removeItem(COSName.ROLE_MAP);
  }

  private static void prepareElement(
      COSDictionary element,
      String prefix,
      COSDictionary classes,
      COSDictionary roles,
      Map<String, PDStructureElement> identifiers,
      Set<COSBase> seen,
      Set<COSBase> attributes)
      throws IOException {
    if (!seen.add(element)) return;
    COSName role = element.getCOSName(COSName.S);
    Set<COSName> mappedRoles = new java.util.HashSet<>();
    while (roles != null && roles.containsKey(role)) {
      if (!mappedRoles.add(role)) throw new IOException("Input PDF has a circular role map.");
      COSBase mapped = roles.getDictionaryObject(role);
      if (!(mapped instanceof COSName)) throw new IOException("Input PDF has an invalid role map.");
      role = (COSName) mapped;
    }
    element.setItem(COSName.S, role);
    String id = element.getString(COSName.ID);
    if (id != null) {
      String renamed = prefix + id;
      if (identifiers.put(renamed, new PDStructureElement(element)) != null) {
        throw new IOException("Input PDF has duplicate structure identifiers.");
      }
      element.setString(COSName.ID, renamed);
    }

    COSBase classNames = element.getDictionaryObject(COSName.C);
    if (classNames instanceof COSName) {
      element.setItem(COSName.C, renamedClass((COSName) classNames, prefix, classes));
    } else if (classNames instanceof COSArray) {
      COSArray names = (COSArray) classNames;
      COSArray renamed = new COSArray();
      for (int i = 0; i < names.size(); i++) {
        COSBase value = names.getObject(i);
        if (!(value instanceof COSName)) {
          throw new IOException("Input PDF has an invalid structure attribute class.");
        }
        renamed.add(renamedClass((COSName) value, prefix, classes));
        COSBase revision = i + 1 < names.size() ? names.getObject(i + 1) : null;
        if (revision instanceof COSInteger) {
          renamed.add(revision);
          i++;
        }
      }
      element.setItem(COSName.C, renamed);
    } else if (classNames != null) {
      throw new IOException("Input PDF has an invalid structure attribute class.");
    }
    renameHeaders(element.getDictionaryObject(COSName.A), prefix, attributes);
    for (COSDictionary child : structureChildren(element.getDictionaryObject(COSName.K))) {
      prepareElement(child, prefix, classes, roles, identifiers, seen, attributes);
    }
  }

  private static COSName renamedClass(COSName name, String prefix, COSDictionary classes)
      throws IOException {
    COSBase definition = classes == null ? null : classes.getDictionaryObject(name);
    if (!(definition instanceof COSDictionary) && !(definition instanceof COSArray)) {
      throw new IOException("Input PDF has an undefined structure attribute class: " + name.getName());
    }
    return COSName.getPDFName(prefix + name.getName());
  }

  private static void renameHeaders(COSBase value, String prefix, Set<COSBase> seen) {
    if (value == null || !seen.add(value)) return;
    if (value instanceof COSArray array) {
      for (int i = 0; i < array.size(); i++) renameHeaders(array.getObject(i), prefix, seen);
    } else if (value instanceof COSDictionary dictionary) {
      COSArray headers = dictionary.getCOSArray(HEADERS);
      if (headers == null || !seen.add(headers)) return;
      for (int i = 0; i < headers.size(); i++) {
        COSBase header = headers.getObject(i);
        if (header instanceof COSString) {
          headers.set(i, new COSString(prefix + ((COSString) header).getString()));
        }
      }
    }
  }

  private static List<COSDictionary> structureChildren(COSBase value) {
    List<COSDictionary> result = new ArrayList<>();
    if (value instanceof COSDictionary && ((COSDictionary) value).containsKey(COSName.S)) {
      result.add((COSDictionary) value);
    } else if (value instanceof COSArray) {
      COSArray children = (COSArray) value;
      for (int i = 0; i < children.size(); i++) {
        result.addAll(structureChildren(children.getObject(i)));
      }
    }
    return result;
  }
}
