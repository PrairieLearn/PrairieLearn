import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDContentStream;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.w3c.dom.Element;

/** Restores source-declared semantics after Chromium printing; never guesses from drawing geometry. */
class PrintPdfFinalize {
  private static final Set<String> PAINT_OPERATORS = Set.of(
      "Tj", "TJ", "'", "\"", "Do", "BI", "sh", "S", "s", "f", "F", "f*", "B", "B*", "b", "b*");
  private static final Set<String> NON_PATH_PAINT_OPERATORS = Set.of("Tj", "TJ", "'", "\"", "Do", "BI", "sh");
  private enum Artifact { ALL, DECORATION }
  private record Tag(String role, String alt, boolean decorativePaint) {}
  private record Mark(boolean tagged, Artifact artifact) {}
  private final Map<String, Tag> tags = new LinkedHashMap<>();
  private final Map<String, String> links = new HashMap<>();
  private final Set<String> found = new HashSet<>();
  private final Map<COSDictionary, Map<Integer, Artifact>> artifacts = new IdentityHashMap<>();
  private final Map<COSDictionary, Set<Integer>> content = new IdentityHashMap<>();

  public static void main(String[] args) throws Exception {
    if (args.length == 5 && args[0].equals("metadata")) {
      try (PDDocument document = Loader.loadPDF(new File(args[1]))) {
        setMetadata(document, args[3], args[4]);
        document.save(args[2]);
      }
      return;
    }
    if (args.length != 3) throw new IllegalArgumentException("Usage: INPUT OUTPUT MANIFEST.xml");
    new PrintPdfFinalize().finalizePdf(args[0], args[1], args[2]);
  }

  private void finalizePdf(String input, String output, String manifest) throws Exception {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    Element source = factory.newDocumentBuilder().parse(new File(manifest)).getDocumentElement();
    String title = source.getAttribute("title");
    String language = source.getAttribute("language");
    if (title.isBlank() || language.isBlank()) throw new IOException("PDF title and language are required.");
    var sourceTags = source.getElementsByTagName("tag");
    for (int i = 0; i < sourceTags.getLength(); i++) {
      Element element = (Element) sourceTags.item(i);
      String marker = element.getAttribute("marker");
      Tag tag = new Tag(element.getAttribute("role"), element.getAttribute("alt"),
          element.getAttribute("decorativePaint").equals("true"));
      if (marker.isBlank() || tags.put(marker, tag) != null) {
        throw new IOException("PDF source markers must be unique.");
      }
    }
    var sourceLinks = source.getElementsByTagName("link");
    for (int i = 0; i < sourceLinks.getLength(); i++) {
      Element element = (Element) sourceLinks.item(i);
      String uri = element.getAttribute("uri");
      String alt = element.getAttribute("alt");
      links.merge(uri, alt, (first, next) -> first.equals(next) ? first : uri);
    }
    try (PDDocument document = Loader.loadPDF(new File(input))) {
      var catalog = document.getDocumentCatalog();
      var tree = catalog.getStructureTreeRoot();
      if (tree == null) throw new IOException("Chromium did not produce a tagged PDF.");
      transformKids(tree.getCOSObject(), null, null, false);
      if (!found.equals(tags.keySet())) {
        Set<String> missing = new HashSet<>(tags.keySet());
        missing.removeAll(found);
        throw new IOException("Chromium omitted declared PDF structure: " + missing);
      }
      clearParentTree(tree.getCOSObject().getCOSDictionary(COSName.PARENT_TREE), document);
      int pageNumber = 0;
      for (PDPage page : document.getPages()) {
        pageNumber++;
        List<Object> tokens = rewriteContent(page, page.getResources(), page.getCOSObject(),
            new ArrayDeque<>(), new HashSet<>(), "page " + pageNumber);
        var stream = new PDStream(document);
        try (var out = stream.createOutputStream(COSName.FLATE_DECODE)) {
          new ContentStreamWriter(out).writeTokens(tokens);
        }
        page.setContents(stream);
        for (var annotation : page.getAnnotations()) {
          if (annotation instanceof PDAnnotationLink link && link.getAction() instanceof PDActionURI uri) {
            String description = links.get(uri.getURI());
            if (description == null && link.getContents() != null && !link.getContents().isBlank()) continue;
            if (description == null || description.isBlank()) {
              throw new IOException("A PDF link has no source description: " + uri.getURI());
            }
            link.setContents(description);
          }
        }
        if (!page.getAnnotations().isEmpty()) page.getCOSObject().setName(COSName.getPDFName("Tabs"), "S");
      }
      setMetadata(document, title, language);
      document.save(output);
    }
  }

  private static void setMetadata(PDDocument document, String title, String language) throws IOException {
    if (title.isBlank() || language.isBlank()) throw new IOException("PDF title and language are required.");
    var catalog = document.getDocumentCatalog();
    document.getDocumentInformation().setTitle(title);
    catalog.setLanguage(language);
    var preferences = catalog.getViewerPreferences();
    if (preferences == null) preferences = new PDViewerPreferences(new COSDictionary());
    preferences.setDisplayDocTitle(true);
    catalog.setViewerPreferences(preferences);
    PDMetadata metadata = new PDMetadata(document);
    metadata.importXMPMetadata(("<?xpacket begin=\"\uFEFF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>"
        + "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
        + "<rdf:Description rdf:about=\"\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:pdfuaid=\"http://www.aiim.org/pdfua/ns/id/\">"
        + "<pdfuaid:part>1</pdfuaid:part><dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">"
        + xml(title) + "</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>")
        .getBytes(StandardCharsets.UTF_8));
    catalog.setMetadata(metadata);
  }

  private static String xml(String value) {
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  private static COSBase resolve(COSBase value) {
    return value instanceof COSObject object ? object.getObject() : value;
  }

  private void transformKids(COSDictionary owner, COSDictionary inheritedPage,
      Artifact inheritedArtifact, boolean ownDecoration) throws IOException {
    COSDictionary page = owner.getCOSDictionary(COSName.PG);
    if (page == null) page = inheritedPage;
    COSBase kids = owner.getDictionaryObject(COSName.K);
    COSArray original = kids instanceof COSArray array ? array : new COSArray();
    if (!(kids instanceof COSArray) && kids != null) original.add(kids);
    COSArray result = new COSArray();
    for (int i = 0; i < original.size(); i++) {
      COSBase raw = original.get(i);
      COSBase child = resolve(raw);
      if (child instanceof COSDictionary element && element.containsKey(COSName.S)) {
        String marker = element.getString(COSName.ALT);
        Tag tag = tags.get(marker);
        Artifact artifact = inheritedArtifact;
        boolean decoration = false;
        if (tag != null) {
          if (!found.add(marker)) throw new IOException("A PDF source marker was duplicated: " + marker);
          if (tag.role().equals("Artifact")) artifact = Artifact.ALL;
          else {
            if ((tag.role().equals("Formula") || tag.role().equals("Figure")) && tag.alt().isBlank()) {
              throw new IOException("A formula or figure has no alternative description.");
            }
            element.setName(COSName.S, tag.role());
            if (tag.alt().isBlank()) element.removeItem(COSName.ALT);
            else element.setString(COSName.ALT, tag.alt());
            decoration = tag.decorativePaint();
          }
        }
        transformKids(element, page, artifact, decoration);
        if (artifact == null) result.add(raw);
      } else if (child instanceof COSNumber ||
          child instanceof COSDictionary dict && dict.getCOSName(COSName.TYPE) == COSName.MCR) {
        COSDictionary contentPage = page;
        int mcid;
        if (child instanceof COSNumber number) mcid = number.intValue();
        else {
          COSDictionary reference = (COSDictionary) child;
          mcid = reference.getInt(COSName.MCID);
          if (reference.getCOSDictionary(COSName.PG) != null) contentPage = reference.getCOSDictionary(COSName.PG);
          if (reference.containsKey(COSName.getPDFName("Stm"))) throw new IOException("Nested PDF structure streams are unsupported.");
        }
        if (contentPage == null || mcid < 0) throw new IOException("PDF content has no page or marked-content identifier.");
        Artifact artifact = inheritedArtifact != null ? inheritedArtifact : ownDecoration ? Artifact.DECORATION : null;
        if (artifact != null) artifacts.computeIfAbsent(contentPage, key -> new HashMap<>()).put(mcid, artifact);
        else {
          content.computeIfAbsent(contentPage, key -> new HashSet<>()).add(mcid);
          result.add(raw);
        }
      } else {
        if (inheritedArtifact != null) throw new IOException("A decorative element contains a PDF annotation.");
        result.add(raw);
      }
    }
    owner.setItem(COSName.K, result);
  }

  private void clearParentTree(COSDictionary node, PDDocument document) {
    if (node == null) return;
    COSArray numbers = node.getCOSArray(COSName.NUMS);
    if (numbers != null) {
      for (int i = 0; i < numbers.size(); i += 2) {
        int parent = ((COSNumber) numbers.getObject(i)).intValue();
        COSBase value = numbers.getObject(i + 1);
        if (!(value instanceof COSArray entries)) continue;
        for (PDPage page : document.getPages()) {
          if (page.getStructParents() != parent) continue;
          for (int mcid : artifacts.getOrDefault(page.getCOSObject(), Map.of()).keySet()) {
            entries.set(mcid, COSNull.NULL);
          }
        }
      }
    }
    COSArray children = node.getCOSArray(COSName.KIDS);
    if (children != null) {
      for (int i = 0; i < children.size(); i++) clearParentTree((COSDictionary) children.getObject(i), document);
    }
  }

  private List<Object> rewriteContent(PDContentStream source, PDResources resources, COSDictionary page,
      ArrayDeque<Mark> marks, Set<COSDictionary> forms, String location) throws IOException {
    List<Object> output = new ArrayList<>();
    List<Object> operands = new ArrayList<>();
    List<Object> tokens = new PDFStreamParser(source).parse();
    int initialDepth = marks.size();
    for (Object token : tokens) {
      if (!(token instanceof Operator operator)) {
        operands.add(token);
        continue;
      }
      String operation = operator.getName();
      if (operation.equals("BDC") || operation.equals("BMC")) {
        COSName name = (COSName) operands.get(0);
        COSDictionary properties = operands.size() > 1 && operands.get(1) instanceof COSDictionary dictionary
            ? dictionary : null;
        if (operands.size() > 1 && operands.get(1) instanceof COSName propertyName) {
          properties = resources.getProperties(propertyName).getCOSObject();
        }
        int mcid = properties == null ? -1 : properties.getInt(COSName.MCID, -1);
        Artifact artifact = artifacts.getOrDefault(page, Map.of()).get(mcid);
        if (artifact != null) {
          operands.clear();
          operands.add(COSName.ARTIFACT);
          operator = Operator.getOperator("BMC");
        } else if (name == COSName.ARTIFACT) artifact = Artifact.ALL;
        marks.push(new Mark(content.getOrDefault(page, Set.of()).contains(mcid), artifact));
      } else if (operation.equals("EMC")) {
        if (marks.size() <= initialDepth) throw new IOException("Unbalanced marked content in " + location);
        marks.pop();
      } else if (PAINT_OPERATORS.contains(operation)) {
        boolean tagged = marks.stream().anyMatch(Mark::tagged);
        boolean artifact = marks.stream().anyMatch(mark -> mark.artifact() != null);
        if (!tagged && !artifact) {
          throw new IOException("Unclassified " + operation + " content in " + location
              + ". Add source semantics or explicitly mark decorative content before PDF export.");
        }
        if (tagged && artifact) throw new IOException("Tagged content is nested inside an artifact in " + location);
        if (marks.stream().anyMatch(mark -> mark.artifact() == Artifact.DECORATION)
            && NON_PATH_PAINT_OPERATORS.contains(operation)) {
          throw new IOException("Declared CSS decoration contains text or graphics in " + location);
        }
        if (operation.equals("Do") && resources.getXObject((COSName) operands.get(0)) instanceof PDFormXObject form) {
          if (!forms.add(form.getCOSObject())) throw new IOException("Recursive PDF form content.");
          if (form.getStructParents() >= 0) throw new IOException("Nested PDF structure streams are unsupported.");
          rewriteContent(form, form.getResources() == null ? resources : form.getResources(), page,
              new ArrayDeque<>(marks), forms, location + " form");
          forms.remove(form.getCOSObject());
        }
      }
      output.addAll(operands);
      output.add(operator);
      operands.clear();
    }
    if (marks.size() != initialDepth || !operands.isEmpty()) throw new IOException("Unbalanced PDF content in " + location);
    return output;
  }
}
