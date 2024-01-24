import { html } from "@prairielearn/html"

export function EditTotalScorePercForm({resLocals, id}: {resLocals: Record<string, any>, id: string}) {
    return html`
        <form name="edit-total-score-perc-form" method="POST">
            <input type="hidden" name="__action" value="edit_total_score_perc">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}">
            <input type="hidden" name="assessment_instance_id" value="${resLocals.assessment_instance.id}">
            <div class="form-group">
            <div class="input-group">
                <input type="text" class="form-control" name="score_perc" value="${resLocals.assessment_instance.score_perc}">
                <span class="input-group-addon">%</span>
            </div>
            </div>
            <p><small>This change will be overwritten if further questions are answered by the student.</small></p>
            <div class="text-right">
                <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">Cancel</button>
                <button type="submit" class="btn btn-primary">Change</button>
            </div>
        </form>
    `  
}